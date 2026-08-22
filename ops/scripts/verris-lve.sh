#!/usr/bin/env bash
# =============================================================================
# Verris — node LVE agent (CloudLinux)
#
# Runs every minute (verris-lve.timer). Two jobs, both idempotent:
#   1. RECONCILE — pull desired LVE from the control-plane
#      (GET /agent/tasks/lve/desired) and apply it via `lvectl`:
#        - package-set per plan slug  (new accounts inherit plan limits)
#        - set-user per hosting account (effective limits = plan + autoscaling)
#      Only drifted packages/users are touched; `lvectl apply` is run once when
#      anything changed.
#   2. TELEMETRY — read live per-LVE usage from /proc/lve/list (no dependency on
#      the CloudLinux stats daemon) and POST per-account CPU%/RAM/IO/disk to
#      /telemetry/lve so the autoscaling engine has real data.
#
# WHY lvectl and not DirectAdmin: verified on DA 1.697 + CloudLinux 10 that
# CMD_API_MODIFY_USER / CMD_API_MANAGE_USER_PACKAGES return error=0 but do NOT
# change LVE limits. `lvectl` is the only mechanism that actually enforces them.
#
# /proc/lve/list units (verified live): CPU col=cumulative ns, MEMPHY col=4KB
# pages, IO col=cumulative bytes.
#
# Requires: /etc/verris.conf (VERRIS_API_URL, VERRIS_SERVER_ID, VERRIS_IDENTITY_TOKEN)
# =============================================================================
set -uo pipefail

CONFIG_FILE="/etc/verris.conf"
LOG="/var/log/verris-lve.log"
LOCK="/var/run/verris-lve.lock"
STATE="/var/run/verris-lve.state.json"

[ -r "$CONFIG_FILE" ] || { echo "[verris-lve] missing $CONFIG_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
source "$CONFIG_FILE"
: "${VERRIS_API_URL:?missing VERRIS_API_URL}"
: "${VERRIS_SERVER_ID:?missing VERRIS_SERVER_ID}"
: "${VERRIS_IDENTITY_TOKEN:?missing VERRIS_IDENTITY_TOKEN}"

mkdir -p /var/run /var/log 2>/dev/null || true

# Single instance only.
exec 9>"$LOCK"
flock -n 9 || exit 0

# CloudLinux not present (e.g. control-plane or non-CL node) — nothing to do.
if ! command -v lvectl >/dev/null 2>&1; then
  echo "[$(date -u +%FT%TZ)] lvectl not found — skipping (node without CloudLinux)" >> "$LOG"
  exit 0
fi

# CageFS status (reported to control-plane every cycle for the node audit).
# cagefsctl --cagefs-status prints "CageFS is enabled" / "... disabled".
CAGEFS_ENABLED=0
CAGEFS_COUNT=0
if command -v cagefsctl >/dev/null 2>&1; then
  if cagefsctl --cagefs-status 2>/dev/null | grep -qi 'enabled'; then
    CAGEFS_ENABLED=1
  fi
  CAGEFS_COUNT=$(cagefsctl --list-enabled 2>/dev/null | grep -c . 2>/dev/null || echo 0)
fi

# Security hardening marker (audit F-07) — written by
# security-hardening-baseline.sh; reported so the panel audit can verify the
# node went through the LIVE onboarding hardening.
HARDENED=0
[ -f /etc/verris-hardened ] && HARDENED=1

export VERRIS_API_URL VERRIS_SERVER_ID VERRIS_IDENTITY_TOKEN STATE LOG CAGEFS_ENABLED CAGEFS_COUNT HARDENED

python3 - <<'PYEOF'
import json, os, re, subprocess, sys, time, pwd, urllib.request, urllib.error

API   = os.environ["VERRIS_API_URL"].rstrip("/")
SID   = os.environ["VERRIS_SERVER_ID"]
TOK   = os.environ["VERRIS_IDENTITY_TOKEN"]
STATE = os.environ.get("STATE", "/var/run/verris-lve.state.json")
LOG   = os.environ.get("LOG", "/var/log/verris-lve.log")
AGENT_VERSION = "lve-agent/1.0"
HDR = {"X-Server-Id": SID, "X-Server-Token": TOK}

def log(msg):
    try:
        with open(LOG, "a") as f:
            f.write("[%s] %s\n" % (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), msg))
    except Exception:
        pass

def api_get(path):
    req = urllib.request.Request(API + path, headers=HDR)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))

def api_post(path, body):
    data = json.dumps(body).encode("utf-8")
    h = dict(HDR); h["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, data=data, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def lvectl(*args):
    return subprocess.run(["lvectl", *args], capture_output=True, text=True)

def to_int(s):
    m = re.sub(r"[^0-9]", "", str(s) if s is not None else "")
    return int(m) if m else 0

# --------------------------------------------------------------------------
# 1) RECONCILE
# --------------------------------------------------------------------------
def parse_lvectl_table(text):
    """Parse `lvectl package-list` / `list-user` into {name: {speed,pmem,ep,nproc,io,iops}}."""
    res = {}
    for line in text.splitlines():
        p = line.split()
        if len(p) < 8:
            continue
        if p[0] in ("ID",):
            continue
        name = p[0]
        try:
            res[name] = {
                "speed": to_int(p[1]),
                "pmem":  to_int(p[2]),   # "1024M" -> 1024
                "ep":    to_int(p[4]),
                "nproc": to_int(p[5]),
                "io":    to_int(p[6]),
                "iops":  to_int(p[7]),
            }
        except Exception:
            continue
    return res

def want_matches(cur, d):
    return (cur
            and cur["speed"] == d["speedPct"]
            and cur["pmem"]  == d["pmemMb"]
            and cur["ep"]    == d["ep"]
            and cur["nproc"] == d["nproc"]
            and cur["io"]    == d["ioKbps"]
            and cur["iops"]  == d["iops"])

def reconcile(desired):
    changed = False
    # packages
    pkgs = parse_lvectl_table(lvectl("package-list").stdout)
    for d in desired.get("packages", []):
        cur = pkgs.get(d["name"])
        if want_matches(cur, d):
            continue
        r = lvectl("package-set", d["name"],
                   "--speed=%d%%" % d["speedPct"],
                   "--pmem=%dM" % d["pmemMb"],
                   "--vmem=0",
                   "--io=%d" % d["ioKbps"],
                   "--iops=%d" % d["iops"],
                   "--ep=%d" % d["ep"],
                   "--nproc=%d" % d["nproc"])
        if r.returncode == 0:
            changed = True
            log("package-set %s -> speed=%d%% pmem=%dM io=%d iops=%d ep=%d nproc=%d"
                % (d["name"], d["speedPct"], d["pmemMb"], d["ioKbps"], d["iops"], d["ep"], d["nproc"]))
        else:
            log("package-set %s FAILED: %s" % (d["name"], (r.stderr or r.stdout).strip()[:200]))
    # per-account
    users = parse_lvectl_table(lvectl("list-user").stdout)
    for d in desired.get("accounts", []):
        u = d["username"]
        cur = users.get(u)
        if want_matches(cur, d):
            continue
        r = lvectl("set-user", u,
                   "--speed=%d%%" % d["speedPct"],
                   "--pmem=%dM" % d["pmemMb"],
                   "--vmem=0",
                   "--io=%d" % d["ioKbps"],
                   "--iops=%d" % d["iops"],
                   "--ep=%d" % d["ep"],
                   "--nproc=%d" % d["nproc"])
        if r.returncode == 0:
            changed = True
            log("set-user %s -> speed=%d%% pmem=%dM io=%d iops=%d ep=%d nproc=%d"
                % (u, d["speedPct"], d["pmemMb"], d["ioKbps"], d["iops"], d["ep"], d["nproc"]))
            try:
                uid = pwd.getpwnam(u).pw_uid
                lvectl("apply", str(uid))
            except KeyError:
                pass
        else:
            log("set-user %s FAILED: %s" % (u, (r.stderr or r.stdout).strip()[:200]))
    if changed:
        lvectl("apply", "all")
    return changed

# --------------------------------------------------------------------------
# 2) TELEMETRY (live, from /proc/lve/list)
# --------------------------------------------------------------------------
# /proc/lve/list columns (header v10), 0-indexed:
#   0 LVE("0,<uid>")  13 CPU(cumulative ns)  15 IO(cumulative bytes)  18 MEMPHY(4K pages)
def read_proc_lve():
    out = {}
    try:
        with open("/proc/lve/list") as f:
            lines = f.read().splitlines()
    except Exception as e:
        log("read /proc/lve/list failed: %s" % e)
        return out
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) < 19:
            continue
        try:
            uid = int(parts[0].split(",")[1])
            out[uid] = {
                "cpu_ns": int(parts[13]),
                "io":     int(parts[15]),
                "memphy": int(parts[18]),
            }
        except Exception:
            continue
    return out

def disk_usage_mb(username):
    try:
        r = subprocess.run(["du", "-sm", "/home/%s" % username], capture_output=True, text=True, timeout=30)
        if r.returncode == 0:
            return int(r.stdout.split()[0])
    except Exception:
        pass
    return 0

def load_state():
    try:
        with open(STATE) as f:
            return json.load(f)
    except Exception:
        return None

def save_state(st):
    try:
        tmp = STATE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(st, f)
        os.replace(tmp, STATE)
    except Exception as e:
        log("save_state failed: %s" % e)

def telemetry(desired):
    now_ns = time.time_ns()
    cur = read_proc_lve()
    # username <-> uid only for managed hosting accounts
    managed = {}
    for d in desired.get("accounts", []):
        try:
            managed[pwd.getpwnam(d["username"]).pw_uid] = d["username"]
        except KeyError:
            continue
    new_state = {"ts_ns": now_ns, "uids": {str(uid): cur[uid] for uid in cur if uid in managed}}
    prev = load_state()
    save_state(new_state)
    if not prev or "ts_ns" not in prev:
        log("telemetry: first sample stored (no delta yet)")
        return 0
    dt_ns = now_ns - int(prev["ts_ns"])
    dt_s = dt_ns / 1e9
    if dt_s < 2:
        return 0
    accounts = []
    for uid, username in managed.items():
        c = cur.get(uid)
        p = prev.get("uids", {}).get(str(uid))
        if not c or not p:
            continue
        dcpu = max(0, c["cpu_ns"] - p.get("cpu_ns", 0))
        dio  = max(0, c["io"] - p.get("io", 0))
        cpu_pct = round(min(100000.0, (dcpu / dt_ns) * 100.0), 2)
        mem_mb  = round(c["memphy"] / 256.0, 1)   # pages*4096/1048576
        io_kbps = round((dio / dt_s) / 1024.0, 1)
        accounts.append({
            "username": username,
            "cpuUsagePercent": cpu_pct,
            "cpuUsageMaxPercent": cpu_pct,
            "memUsageMb": mem_mb,
            "memUsageMaxMb": mem_mb,
            "diskUsageMb": disk_usage_mb(username),
            "ioUsageKbps": io_kbps,
        })
    if not accounts:
        return 0
    bucket = max(15, min(86400, int(round(dt_s))))
    try:
        api_post("/telemetry/lve", {
            "bucketDurationS": bucket,
            "agentVersion": AGENT_VERSION,
            "accounts": accounts,
            "node": node_block(),
        })
        log("telemetry: posted %d account(s), bucket=%ds" % (len(accounts), bucket))
    except Exception as e:
        log("telemetry POST failed: %s" % e)
    return len(accounts)

# --------------------------------------------------------------------------
# 3) NODE STATUS — CageFS etc. (always reported, even with no accounts)
# --------------------------------------------------------------------------
def db_engine_version():
    # DB-1 — odczyt silnika+wersji bazy lokalnie na węźle (3306 jest zamknięty
    # z control-plane, więc wersję raportuje agent). Best-effort: parsujemy
    # `mariadbd --version` / `mysqld --version`, np.:
    #   "mariadbd  Ver 10.6.18-MariaDB for ..." -> ("MariaDB", "10.6.18")
    #   "mysqld  Ver 8.0.36 for Linux ..."      -> ("MySQL", "8.0.36")
    import subprocess, re, shutil
    for binname in ("mariadbd", "mysqld"):
        path = shutil.which(binname)
        if not path:
            continue
        try:
            out = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=5)
            text = (out.stdout or "") + (out.stderr or "")
        except Exception:
            continue
        if not text:
            continue
        ver = re.search(r"Ver\s+([0-9]+\.[0-9]+\.[0-9]+)", text)
        engine = "MariaDB" if re.search(r"mariadb", text, re.I) else "MySQL"
        if ver:
            return engine, ver.group(1)
    return None, None

def node_block():
    engine, version = db_engine_version()
    block = {
        "cagefsEnabled": os.environ.get("CAGEFS_ENABLED") == "1",
        "cagefsEnabledCount": to_int(os.environ.get("CAGEFS_COUNT")),
        "hardened": os.environ.get("HARDENED") == "1",
    }
    if engine:
        block["dbEngine"] = engine
    if version:
        block["dbVersion"] = version
    return block

def report_node_status():
    try:
        api_post("/telemetry/lve", {"agentVersion": AGENT_VERSION, "accounts": [], "node": node_block()})
        log("node status: cagefs_enabled=%s caged_accounts=%s"
            % (os.environ.get("CAGEFS_ENABLED"), os.environ.get("CAGEFS_COUNT")))
    except Exception as e:
        log("node status POST failed: %s" % e)

# --------------------------------------------------------------------------
def main():
    try:
        desired = api_get("/agent/tasks/lve/desired")
    except urllib.error.HTTPError as e:
        log("desired fetch HTTP %s" % e.code)
        desired = {"packages": [], "accounts": []}
    except Exception as e:
        log("desired fetch failed: %s" % e)
        desired = {"packages": [], "accounts": []}
    try:
        reconcile(desired)
    except Exception as e:
        log("reconcile error: %s" % e)
    try:
        telemetry(desired)
    except Exception as e:
        log("telemetry error: %s" % e)
    try:
        report_node_status()
    except Exception as e:
        log("node status error: %s" % e)

main()
PYEOF

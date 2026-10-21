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
#   3. FAULTS (F2.6, co ~10 min) — liczba odbić kont od limitów (CPU, EP, NPROC,
#      PMEM, IO, IOPS) w oknach 24 h i 7 dni z historii LVE-Stats 2
#      (`cloudlinux-statistics --json`, format: https://docs.cloudlinux.com/cloudlinuxos/command-line_tools/#cloudlinux-statistics
#      — to samo źródło co lveinfo: https://docs.cloudlinux.com/cloudlinuxos/command-line_tools/#lveinfo).
#      Osobny POST /telemetry/lve z blokiem `faults`; błąd narzędzia idzie jako `faults.error`, nie jako zera.
#   4. WATCHDOG USŁUG (F3.4) — w bloku `node` stan usług z białej listy panelu (systemctl show); API liczy z niego
#      metrykę verris_node_services_down i alert VerrisUslugaWezlaNieDziala.
#   5. AKTUALIZACJE (21.10, co ~6 h albo od razu po /var/run/verris-aktualizacje.wymus) — oczekujące poprawki
#      bezpieczeństwa z dnf (advisory, waga, pakiet, CVE), składniki CustomBuild z nowszą wersją (`./build versions`,
#      https://docs.directadmin.com/custombuild/upgrading-services.html) i pełne wersje alt-php. Osobny POST
#      /telemetry/lve z blokiem `aktualizacje` (kształt: libs/contracts/src/aktualizacje-wezla.ts); błąd narzędzia idzie
#      jako `blad`, nie jako pusta lista („brak poprawek”). Krok jest ostatni w cyklu: dnf trwa do kilku minut, a blokada
#      pliku (flock) w tym czasie wstrzymuje tylko kolejne cykle tego agenta.
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
AGENT_VERSION = "lve-agent/1.4"
FAULTS_STATE = "/var/run/verris-lve.faults.json"
FAULTS_EVERY_S = 600
FAULTS_LIMIT = 200
FAULTS_STAT_BIN = "cloudlinux-statistics"
AKT_STATE = "/var/run/verris-aktualizacje.json"
AKT_WYMUS = "/var/run/verris-aktualizacje.wymus"
AKT_EVERY_S = 6 * 3600
# Po nieudanym wysłaniu przy pliku wymuszenia — następna próba najwcześniej po 5 min (nie dnf co minutę).
AKT_RETRY_S = 300
AKT_DNF_BIN = "dnf"
AKT_RPM_BIN = "rpm"
AKT_CB_DIR = "/usr/local/directadmin/custombuild"
AKT_TIMEOUT_S = 180
AKT_MAKS_POPRAWEK = 500
AKT_MAKS_CVE = 50
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
                   "--maxEntryProcs=%d" % d["ep"],
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
                   "--maxEntryProcs=%d" % d["ep"],
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

def node_capacity():
    # NODE-03 — pojemność węzła przy każdym raporcie, nie tylko w handshake:
    # rozbudowa serwera (RAM, dysk, rdzenie) dociera do selektora węzłów.
    # Te same źródła co handshake: nproc, `free -m` (MemTotal), `df -mP /`.
    cap = {}
    try:
        cap["totalCpuCores"] = os.cpu_count() or 0
        with open("/proc/meminfo") as fh:
            for line in fh:
                if line.startswith("MemTotal:"):
                    cap["totalMemoryMb"] = int(line.split()[1]) // 1024
                    break
        import shutil
        cap["totalDiskMb"] = shutil.disk_usage("/").total // (1024 * 1024)
    except Exception:
        pass
    return {k: v for k, v in cap.items() if isinstance(v, int) and v > 0}

def stack_versions():
    # PB-30 — wersje stosu do raportu zgodności floty z manifestem (best-effort, każde osobno).
    import subprocess, re
    out = {}
    # 13.10 — wersja ZASTOSOWANA (plik zapisuje bootstrap i udane wyrównanie), nie pobrana co minutę
    # /etc/verris-stack.env; bez pliku węzeł nie raportuje manifestu („bez raportu”), zamiast udawać zgodność.
    try:
        with open("/etc/verris-stack.applied") as fh:
            for line in fh:
                if line.startswith("VERRIS_STACK_VERSION="):
                    out["stackVersion"] = line.split("=", 1)[1].strip().strip("'\"")[:40]
    except Exception:
        pass
    try:
        with open("/usr/local/lsws/VERSION") as fh:
            v = fh.read().strip()
            if re.match(r"^[0-9][0-9A-Za-z.\-]{0,38}$", v):
                out["lsVersion"] = v
    except Exception:
        pass
    def first(cmd, pattern):
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
            m = re.search(pattern, (r.stdout or "") + (r.stderr or ""))
            return m.group(1)[:40] if m else None
        except Exception:
            return None
    da = first(["/usr/local/directadmin/directadmin", "version"], r"([0-9]+\.[0-9]+(?:\.[0-9]+)?)")
    if da:
        out["daVersion"] = da
    php = first(["/usr/local/bin/php", "-r", "echo PHP_VERSION;"], r"^([0-9]+\.[0-9]+\.[0-9]+)")
    if php:
        out["phpVersion"] = php
    cl = cl_version()
    if cl:
        out["clVersion"] = cl
    return out

def cl_version(kernel=None):
    # Wersja CloudLinux (LVE) = wersja pakietu kmod-lve. Weryfikacja 11.10 (t1): po aktualizacji z nowym jądrem, przed
    # rebootem, są zainstalowane DWIE wersje kmod-lve (moduł per jądro), a `rpm -q --qf` bez „\n” sklejał je w
    # „2.1-76.el102.1-78.el10”. Raportujemy JEDNĄ, zachowawczo tę, która faktycznie działa: pakiet z modułem dla
    # działającego jądra (pliki pod /lib/modules/$(uname -r)/). Gdy żadna nie pasuje (np. moduł przez weak-updates) —
    # najpóźniej zainstalowaną (%{INSTALLTIME}); to stan po reboocie, gdy stary pakiet zostaje obok nowego.
    # rpm --queryformat (tablice „[...]”, %{INSTALLTIME}): https://rpm-software-management.github.io/rpm/manual/queryformat.html
    def rpm(*args):
        try:
            r = subprocess.run(["rpm", "-q", *args], capture_output=True, text=True, timeout=8)
            return r.stdout or ""
        except Exception:
            return ""
    wersje = []
    for line in rpm("--qf", "%{INSTALLTIME} %{VERSION}-%{RELEASE}\n", "kmod-lve").splitlines():
        m = re.match(r"^([0-9]+) ([0-9][^\s]{0,39})$", line.strip())
        if m:
            wersje.append((int(m.group(1)), m.group(2)))
    if not wersje:
        return None
    if len(wersje) == 1:
        return wersje[0][1]
    kernel = kernel or os.uname().release
    for _, v in wersje:
        pliki = rpm("--qf", "[%{FILENAMES}\n]", "kmod-lve-" + v).splitlines()
        if any(p.startswith("/lib/modules/%s/" % kernel) for p in pliki):
            return v
    return max(wersje)[1]

# F3.4 — watchdog usług węzła: stan usług z białej listy panelu (libs/contracts/src/uslugi-wezla.ts, bez agentów Verris —
# agent nie raportuje sam o sobie). Pierwsza załadowana jednostka z listy; ActiveState i UnitFileState z
# `systemctl show --property=…` (https://www.freedesktop.org/software/systemd/man/latest/systemctl.html). Błąd odczytu
# jednostki = brak wpisu (panel pokazuje „brak danych”, nie „działa”); bez systemctl — bez bloku `services`.
WATCHDOG_USLUGI = {
    "www": ["lsws.service", "litespeed.service", "httpd.service"],
    "exim": ["exim.service"],
    "dovecot": ["dovecot.service"],
    "mariadb": ["mariadb.service", "mysqld.service", "mysql.service"],
    "named": ["named.service"],
    "ftp": ["pure-ftpd.service", "pureftpd.service", "proftpd.service"],
    "directadmin": ["directadmin.service"],
    "fail2ban": ["fail2ban.service"],
    "sshd": ["sshd.service"],
}
SYSTEMCTL_BIN = "systemctl"

def services_block():
    import shutil, subprocess
    if not shutil.which(SYSTEMCTL_BIN):
        return None
    out = []
    for klucz, jednostki in WATCHDOG_USLUGI.items():
        for j in jednostki:
            try:
                r = subprocess.run([SYSTEMCTL_BIN, "show", j, "--property=LoadState,ActiveState,UnitFileState"],
                                   capture_output=True, text=True, timeout=10)
            except Exception:
                break
            if r.returncode != 0:
                break
            w = dict(l.split("=", 1) for l in r.stdout.splitlines() if "=" in l)
            if w.get("LoadState") != "loaded":
                continue
            stan = re.sub(r"[^a-z-]", "", w.get("ActiveState", ""))[:20]
            plik = re.sub(r"[^a-z-]", "", w.get("UnitFileState", ""))[:20]
            if stan:
                out.append({"k": klucz, "s": stan, **({"e": plik} if plik else {})})
            break
    return out

def node_block():
    engine, version = db_engine_version()
    block = {
        "cagefsEnabled": os.environ.get("CAGEFS_ENABLED") == "1",
        "cagefsEnabledCount": to_int(os.environ.get("CAGEFS_COUNT")),
        "hardened": os.environ.get("HARDENED") == "1",
        **node_capacity(),
    }
    if engine:
        block["dbEngine"] = engine
    if version:
        block["dbVersion"] = version
    block.update(stack_versions())
    try:
        uslugi = services_block()
        if uslugi is not None:
            block["services"] = uslugi
    except Exception as e:
        log("services watchdog: %s" % e)
    return block

def report_node_status():
    try:
        api_post("/telemetry/lve", {"agentVersion": AGENT_VERSION, "accounts": [], "node": node_block()})
        log("node status: cagefs_enabled=%s caged_accounts=%s"
            % (os.environ.get("CAGEFS_ENABLED"), os.environ.get("CAGEFS_COUNT")))
    except Exception as e:
        log("node status POST failed: %s" % e)

# --------------------------------------------------------------------------
# 4) FAULTS — odbicia od limitów (F2.6, diagnoza „508”)
# --------------------------------------------------------------------------
# cloudlinux-statistics --json (LVE-Stats 2): {"result": "success", "users": [{"username", "faults": <lve_section>}]},
# <lve_section> = {"cpu": {"lve": N}, "ep": {...}, "nproc": {...}, "pmem": {...}, "io": {...}, "iops": {...}}.
# Błąd: "result" ≠ "success" (komunikat z "context"). --order-by=any_faults + --limit: najgorsze konta pierwsze,
# bez niejednoznacznego --threshold. https://docs.cloudlinux.com/cloudlinuxos/command-line_tools/#cloudlinux-statistics
FAULT_KEYS = ("cpu", "ep", "nproc", "pmem", "io", "iops")

class FaultsError(Exception):
    pass

def faults_window(period, managed):
    name = os.path.basename(FAULTS_STAT_BIN)
    try:
        r = subprocess.run([FAULTS_STAT_BIN, "--json", "--period=%s" % period, "--order-by=any_faults",
                            "--limit=%d" % FAULTS_LIMIT], capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        raise FaultsError("brak %s (LVE-Stats 2)" % name)
    except subprocess.TimeoutExpired:
        raise FaultsError("%s --period=%s: przekroczony czas" % (name, period))
    try:
        j = json.loads(r.stdout or "")
    except Exception:
        raise FaultsError("%s --period=%s: exit %d, %s" % (name, period, r.returncode,
                          ((r.stderr or r.stdout or "").strip() or "brak odpowiedzi")[:200]))
    if not isinstance(j, dict) or j.get("result") != "success":
        res = str(j.get("result") if isinstance(j, dict) else j)
        ctx = j.get("context") if isinstance(j, dict) else None
        try:
            res = res % ctx if isinstance(ctx, dict) else res
        except Exception:
            pass
        raise FaultsError(("%s --period=%s: %s" % (name, period, res))[:300])
    users = j.get("users") or []
    accounts = []
    for u in users:
        name = u.get("username") if isinstance(u, dict) else None
        if not name or name not in managed:
            continue
        f = u.get("faults") or {}
        row = {"username": name}
        for k in FAULT_KEYS:
            v = (f.get(k) or {}).get("lve") if isinstance(f.get(k), dict) else None
            if isinstance(v, (int, float)) and v >= 0:
                row[k] = int(v)
        if any(row.get(k, 0) > 0 for k in FAULT_KEYS):
            accounts.append(row)
    # Pełna strona i ostatnie konto nadal z faultami = na węźle jest ich więcej, niż zmieściło się w raporcie.
    last = users[-1] if users and isinstance(users[-1], dict) else {}
    last_f = last.get("faults") or {}
    truncated = len(users) >= FAULTS_LIMIT and any(
        isinstance(last_f.get(k), dict) and (last_f[k].get("lve") or 0) > 0 for k in FAULT_KEYS)
    return accounts, truncated

def faults_report(managed):
    windows = []
    try:
        for period, hours in (("1d", 24), ("7d", 168)):
            accounts, truncated = faults_window(period, managed)
            windows.append({"hours": hours, "accounts": accounts, "truncated": truncated})
    except FaultsError as e:
        return {"error": str(e)[:300]}
    return {"windows": windows}

def faults_due(now):
    try:
        with open(FAULTS_STATE) as f:
            return now - float(json.load(f).get("ts", 0)) >= FAULTS_EVERY_S
    except Exception:
        return True

def report_faults(desired, desired_ok):
    # Bez listy kont z API nie wiemy, które konta są Verris — pusty raport udawałby „zero faultów”.
    if not desired_ok:
        return
    now = time.time()
    if not faults_due(now):
        return
    # Stan zapisany przed odczytem: przy błędzie API (np. starsze API bez `faults`) kolejna próba za ~10 min,
    # a nie co minutę z dwoma przebiegami cloudlinux-statistics.
    try:
        with open(FAULTS_STATE, "w") as f:
            json.dump({"ts": now}, f)
    except Exception as e:
        log("faults state save failed: %s" % e)
    managed = set(d["username"] for d in desired.get("accounts", []) if d.get("username"))
    report = faults_report(managed)
    try:
        # Osobny POST: API bez obsługi `faults` odrzuci tylko ten raport, nie telemetrię zużycia.
        api_post("/telemetry/lve", {"agentVersion": AGENT_VERSION, "accounts": [], "faults": report})
    except Exception as e:
        log("faults POST failed: %s" % e)
        return
    if "error" in report:
        log("faults: %s" % report["error"])
    else:
        log("faults: %s" % ", ".join("%dh=%d" % (w["hours"], len(w["accounts"])) for w in report["windows"]))

# --------------------------------------------------------------------------
# 5) AKTUALIZACJE — oczekujące poprawki bezpieczeństwa (weryfikator aktualizacji, 21.10)
# --------------------------------------------------------------------------
# dnf 4 (AlmaLinux / CloudLinux 10), polecenie `updateinfo list` — jedna linia na parę (poprawka, pakiet):
#   `dnf -q updateinfo list --security --available`             → „ALSA-2026:1234 Important/Sec. php-cli-8.3.12-1.el10.x86_64”
#   `dnf -q updateinfo list --security --available --with-cve`  → „CVE-2026-1234 Important/Sec. php-cli-8.3.12-1.el10.x86_64”
# (dnf(8), sekcja „Updateinfo Command”: --security, --available, --with-cve). Waga przed „/Sec.” jest opcjonalna
# (advisory bez Severity → „Sec.”) — wtedy 'Unknown'. CVE łączymy z poprawką po pełnej nazwie pakietu (NEVRA): każda
# poprawka podnosi pakiet do własnej wersji, więc para (advisory, NEVRA) jest jednoznaczna. Linie nieczytelne pomijamy;
# kod wyjścia ≠ 0 albo przekroczony czas = `blad` (nigdy pusta lista, która wyglądałaby jak „wszystko załatane”).
AKT_WAGI = ("Critical", "Important", "Moderate", "Low")
AKT_LINIA_RE = re.compile(r"^\s*(?:i\s+)?(\S+)\s+(?:(Critical|Important|Moderate|Low)/)?Sec\.\s+(\S+)\s*$")
AKT_CVE_RE = re.compile(r"^CVE-\d{4}-\d{4,7}$")
# `./build versions` (DirectAdmin CustomBuild) — dla nieaktualnego składnika linia „<nazwa> <ma> to <nowa> update is available.”
AKT_CB_RE = re.compile(r"^(.+?)\s+(\S+)\s+to\s+(\S+)\s+update is available\.?\s*$")

class AktualizacjeError(Exception):
    pass

def akt_uruchom(cmd, cwd=None):
    nazwa = os.path.basename(cmd[0])
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=AKT_TIMEOUT_S, cwd=cwd)
    except FileNotFoundError:
        raise AktualizacjeError("brak %s" % nazwa)
    except subprocess.TimeoutExpired:
        raise AktualizacjeError("%s: przekroczony czas (%d s)" % (nazwa, AKT_TIMEOUT_S))
    if r.returncode != 0:
        opis = ((r.stderr or r.stdout or "").strip().splitlines() or ["brak odpowiedzi"])[-1]
        raise AktualizacjeError(("%s: exit %d, %s" % (nazwa, r.returncode, opis))[:300])
    return r.stdout or ""

def akt_linie_dnf(tekst):
    for linia in tekst.splitlines():
        m = AKT_LINIA_RE.match(linia)
        if m:
            yield m.group(1), m.group(2) or "Unknown", m.group(3)

def akt_dnf():
    try:
        poprawki = akt_uruchom([AKT_DNF_BIN, "-q", "updateinfo", "list", "--security", "--available"])
        cve = akt_uruchom([AKT_DNF_BIN, "-q", "updateinfo", "list", "--security", "--available", "--with-cve"])
    except AktualizacjeError as e:
        return {"poprawki": [], "blad": str(e)[:300]}
    cve_pakietu = {}
    for nr, _waga, pakiet in akt_linie_dnf(cve):
        if AKT_CVE_RE.match(nr):
            cve_pakietu.setdefault(pakiet, [])
            if nr not in cve_pakietu[pakiet]:
                cve_pakietu[pakiet].append(nr)
    wynik, widziane = [], set()
    for advisory, waga, pakiet in akt_linie_dnf(poprawki):
        if AKT_CVE_RE.match(advisory) or (advisory, pakiet) in widziane:
            continue
        widziane.add((advisory, pakiet))
        wynik.append({"advisory": advisory[:64], "waga": waga, "pakiet": pakiet[:200],
                      "cve": sorted(cve_pakietu.get(pakiet, []))[:AKT_MAKS_CVE]})
    # Najważniejsze pierwsze — przy obcięciu do limitu odpadają poprawki o najniższej wadze.
    kolejnosc = {w: i for i, w in enumerate(AKT_WAGI + ("Unknown",))}
    wynik.sort(key=lambda p: (kolejnosc.get(p["waga"], 9), p["advisory"], p["pakiet"]))
    return {"poprawki": wynik[:AKT_MAKS_POPRAWEK]}

def akt_custombuild():
    if not os.path.isdir(AKT_CB_DIR):
        return None
    try:
        tekst = akt_uruchom(["./build", "versions"], cwd=AKT_CB_DIR)
    except AktualizacjeError as e:
        return {"aktualizacje": [], "blad": str(e)[:300]}
    wynik = []
    for linia in tekst.splitlines():
        m = AKT_CB_RE.match(linia.strip())
        if m:
            wynik.append({"nazwa": m.group(1)[:80], "z": m.group(2)[:40], "na": m.group(3)[:40]})
    return {"aktualizacje": wynik[:AKT_MAKS_POPRAWEK]}

def akt_alt_php():
    # Pakiety alt-phpXY-cli (CloudLinux PHP Selector): wersja główna z nazwy, pełna z pola VERSION.
    try:
        r = subprocess.run([AKT_RPM_BIN, "-qa", "--qf", "%{NAME} %{VERSION}\n", "alt-php*-cli"],
                           capture_output=True, text=True, timeout=30)
    except Exception:
        return {}
    wersje = {}
    for linia in (r.stdout or "").splitlines():
        m = re.match(r"^alt-php(\d)(\d+)-cli ([0-9][0-9A-Za-z.]{0,39})$", linia.strip())
        if m:
            wersje["%s.%s" % (m.group(1), m.group(2))] = m.group(3)
    return wersje

def aktualizacje_raport():
    return {
        "sprawdzono": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "dnf": akt_dnf(),
        "custombuild": akt_custombuild(),
        "altPhp": akt_alt_php(),
    }

def aktualizacje_due(now):
    wymus = os.path.exists(AKT_WYMUS)
    try:
        with open(AKT_STATE) as f:
            ts = float(json.load(f).get("ts", 0))
    except Exception:
        return True
    return now - ts >= (AKT_RETRY_S if wymus else AKT_EVERY_S)

def report_aktualizacje():
    now = time.time()
    if not aktualizacje_due(now):
        return
    # Stan przed odczytem (jak faulty): błąd API nie powoduje dnf co minutę.
    try:
        with open(AKT_STATE, "w") as f:
            json.dump({"ts": now}, f)
    except Exception as e:
        log("aktualizacje state save failed: %s" % e)
    wymus = os.path.exists(AKT_WYMUS)
    raport = aktualizacje_raport()
    try:
        # Osobny POST: API bez obsługi `aktualizacje` odrzuci tylko ten raport, nie telemetrię zużycia.
        api_post("/telemetry/lve", {"agentVersion": AGENT_VERSION, "accounts": [], "aktualizacje": raport})
    except Exception as e:
        log("aktualizacje POST failed: %s" % e)
        return
    if wymus:
        try:
            os.remove(AKT_WYMUS)
        except Exception:
            pass
    d = raport["dnf"]
    log("aktualizacje: dnf=%s custombuild=%s alt-php=%s" % (
        d.get("blad") or len(d["poprawki"]),
        "brak" if raport["custombuild"] is None else (raport["custombuild"].get("blad") or len(raport["custombuild"]["aktualizacje"])),
        ",".join("%s:%s" % kv for kv in sorted(raport["altPhp"].items())) or "-"))

# --------------------------------------------------------------------------
def main():
    desired_ok = False
    try:
        desired = api_get("/agent/tasks/lve/desired")
        desired_ok = True
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
    try:
        report_faults(desired, desired_ok)
    except Exception as e:
        log("faults error: %s" % e)
    try:
        report_aktualizacje()
    except Exception as e:
        log("aktualizacje error: %s" % e)

main()
PYEOF

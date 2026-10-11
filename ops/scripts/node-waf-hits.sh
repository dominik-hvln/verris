#!/usr/bin/env bash
# =============================================================================
# Verris — ostatnie trafienia reguł WAF (ModSecurity) dla domen konta (F3.2, zadanie WAF_HITS). Tylko odczyt:
# konfiguracji WAF skrypt nie zmienia (tryb konta ustawia WAF_APPLY / node-waf-apply.sh).
# Uruchamiany przez agenta zadań z env:
#   WH_DOMAINS   domeny konta po przecinku (podaje API z rekordu konta, nie operator)
# Źródło: dziennik audytu ModSecurity. Ścieżka wg dokumentacji DirectAdmina („Audit log files”):
#   https://docs.directadmin.com/webservices/apache/modsecurity.html — /var/log/httpd/modsec_audit.log
#   („Used by Apache, LiteSpeed and OpenLiteSpeed web servers”).
# Format wpisów wg ModSecurity v2 (apache2/msc_logging.c, sec_audit_logger_native / _json):
#   https://github.com/owasp-modsecurity/ModSecurity/blob/v2/master/apache2/msc_logging.c
#   Serial: sekcje „--<granica>-A--” (czas, id transakcji, adres klienta…), „-B--” (wiersz żądania, nagłówki),
#   „-F--” (status odpowiedzi), „-H--” („Message: … [id "…"] [msg "…"]”, „Action: Intercepted (phase N)”);
#   JSON (SecAuditLogFormat JSON): transaction / request / response / audit_data.messages / audit_data.action.
# Sprawdzone na t1 (11.10): LiteSpeed Enterprise pisze do tego pliku JSON ModSecurity v3 (libmodsecurity) — obsługujemy
# oba warianty JSON i Serial z v2. Nieznany format = błąd zadania (nie „brak trafień”).
# Do API trafia tylko: czas, domena, adres klienta, metoda, ścieżka BEZ query string, id i opis reguły, czy
# zablokowano, status. Bez nagłówków, ciasteczek i treści żądań.
# MODSEC_AUDIT_LOG daje się podmienić wyłącznie w testach.
# Wyjście:
#   VERRIS_WAF <czas ISO UTC>|<domena>|<ip>|<metoda>|<ścieżka>|<id reguły>|<opis>|<zablokowano 0/1>|<status>
#              (od najstarszego do najnowszego z pokazanych — API sortuje najnowsze pierwsze)
#   VERRIS_WAF_RAZEM <pasuje> <pokazano> <przeczytano bajtów>
# =============================================================================
set -Eeuo pipefail

: "${WH_DOMAINS:?}"

fail() { echo "[waf-hits] BŁĄD: $*" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || fail "brak python3 na serwerze"

WH_DOMAINS="$WH_DOMAINS" MODSEC_AUDIT_LOG="${MODSEC_AUDIT_LOG:-/var/log/httpd/modsec_audit.log}" python3 -I - <<'PY'
import calendar, ipaddress, json, os, re, sys, time

def fail(msg):
    print(f"[waf-hits] BŁĄD: {msg}", file=sys.stderr)
    sys.exit(1)

DOM_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$")
BAJTOW = 64 * 1024 * 1024   # czytamy koniec dziennika — „ostatnie trafienia”
LIMIT = 300
LIMIT_BAJTOW = 80000        # budżet w BAJTACH UTF-8: agent wysyła do API ostatnie 100 000 bajtów logu (tail -c)

domeny = [d for d in os.environ["WH_DOMAINS"].split(",") if d]
if not domeny or len(domeny) > 200 or any(not DOM_RE.match(d) for d in domeny):
    fail("nieprawidłowa lista domen")
plik = os.environ["MODSEC_AUDIT_LOG"]

def domena_konta(host):
    h = (host or "").strip().lower().rstrip(".")
    h = re.sub(r":\d+$", "", h)
    for d in domeny:
        if h == d or h.endswith("." + d):
            return d
    return None

MIES = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
def czas_iso(s):
    m = re.search(r"(\d{2})/(\w{3})/(\d{4}):(\d{2}):(\d{2}):(\d{2})(?:\.\d+)? ([+-])(\d{2})(\d{2})", s or "")
    if not m or m.group(2) not in MIES:
        return None
    epoka = calendar.timegm((int(m.group(3)), MIES[m.group(2)], int(m.group(1)), int(m.group(4)), int(m.group(5)), int(m.group(6))))
    przesuniecie = (int(m.group(8)) * 3600 + int(m.group(9)) * 60) * (1 if m.group(7) == "+" else -1)
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoka - przesuniecie))

def czysc(s, n):
    return re.sub(r"[\x00-\x1f|]", " ", s or "").strip()[:n]

def ip_ok(s):
    try:
        return str(ipaddress.ip_address((s or "").strip()))
    except ValueError:
        return "-"

def regula(wiadomosci):
    """Pierwsza reguła z [id "…"] (pomijamy zbiorcze 949110/980130 z CRS, jeśli jest konkretna)."""
    znalezione = []
    for w in wiadomosci:
        i = re.search(r'\[id "(\d{1,9})"\]', w)
        if not i:
            continue
        m = re.search(r'\[msg "([^"]{0,300})"\]', w)
        znalezione.append((i.group(1), m.group(1) if m else ""))
    if not znalezione:
        return None
    konkretne = [z for z in znalezione if z[0] not in ("949110", "980130", "959100", "980140")]
    return (konkretne or znalezione)[0]

def trafienie(czas, host, ip, linia, wiadomosci, zablokowano, status):
    d = domena_konta(host)
    r = regula(wiadomosci)
    if not d or not r:
        return None
    czesci = (linia or "").split(" ")
    metoda = czesci[0] if czesci and re.fullmatch(r"[A-Z]{3,10}", czesci[0]) else "-"
    sciezka = czesci[1].split("?", 1)[0] if len(czesci) > 1 else "-"
    return [czas or "-", d, ip_ok(ip), metoda, czysc(sciezka, 200) or "/", r[0], czysc(r[1], 150), "1" if zablokowano else "0", str(status or "-")]

GRANICA_RE = re.compile(r"^--([0-9A-Za-z]{8,32})-([A-Z])--$")

def serial(tekst):
    """
    Format natywny: wpis od sekcji A do Z TEJ SAMEJ granicy (ModSecurity losuje granicę dla każdej transakcji).
    Audyt Fali 3 — znacznik z inną granicą wewnątrz otwartego wpisu to treść (np. wstrzyknięta w ciało żądania,
    sekcje C/I), nie nowa sekcja; wpis bez zamykającego „-Z--” tej granicy (urwany) odrzucamy.
    """
    wpisy, biezacy, granica, sekcja = [], None, None, None
    for l in tekst.splitlines():
        m = GRANICA_RE.match(l)
        if m and biezacy is None:
            if m.group(2) == "A":
                biezacy, granica, sekcja = {"A": [], "B": [], "F": [], "H": []}, m.group(1), "A"
            continue
        if m and m.group(1) == granica:
            sekcja = m.group(2)
            if sekcja == "Z":
                wpisy.append(biezacy)
                biezacy, granica, sekcja = None, None, None
            elif sekcja == "A":
                biezacy = {"A": [], "B": [], "F": [], "H": []}
            continue
        if biezacy is not None and sekcja in biezacy:
            biezacy[sekcja].append(l)
    out = []
    for w in wpisy:
        a = w["A"][0] if w["A"] else ""
        czesci_a = re.match(r"^\[([^\]]+)\] (\S+) (\S+) ", a)
        host = next((x.split(":", 1)[1] for x in w["B"][1:] if x.lower().startswith("host:")), "")
        status = next((re.search(r" (\d{3})\b", x).group(1) for x in w["F"][:1] if re.search(r" (\d{3})\b", x)), None)
        wiad = [x[len("Message: "):] for x in w["H"] if x.startswith("Message: ")]
        t = trafienie(czas_iso(czesci_a.group(1)) if czesci_a else None, host, czesci_a.group(3) if czesci_a else "",
                      w["B"][0] if w["B"] else "", wiad, any(x.startswith("Action: Intercepted") for x in w["H"]), status)
        if t:
            out.append(t)
    return out

def czas_v3(s):
    """ModSecurity v3 (libmodsecurity): time_stamp jak ctime(), np. „Sun Oct 11 14:20:00 2026”, w czasie lokalnym serwera."""
    try:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.mktime(time.strptime((s or "").strip(), "%a %b %d %H:%M:%S %Y"))))
    except (ValueError, OverflowError):
        return None

def regula_v3(wiadomosci):
    """v3: messages[] = {message, details: {ruleId, msg, …}} — ta sama zasada co regula() (bez zbiorczych z CRS)."""
    znalezione = []
    for w in wiadomosci:
        if not isinstance(w, dict):
            continue
        d = w.get("details") or {}
        rid = str(d.get("ruleId") or "")
        if not re.fullmatch(r"\d{1,9}", rid):
            continue
        znalezione.append((rid, str(d.get("msg") or w.get("message") or "")))
    if not znalezione:
        return None
    konkretne = [z for z in znalezione if z[0] not in ("949110", "980130", "959100", "980140")]
    return (konkretne or znalezione)[0]

def jsonowy(tekst):
    """
    JSON w dwóch odmianach:
    - ModSecurity v2 (SecAuditLogFormat JSON): transaction / request / response / audit_data na najwyższym poziomie;
    - ModSecurity v3 (libmodsecurity — tak pisze LiteSpeed na t1, sprawdzone 11.10): wszystko w „transaction”
      (time_stamp, client_ip, request{method, uri, headers}, response{http_code}, messages[{details{ruleId,msg}}]).
      https://github.com/owasp-modsecurity/ModSecurity/blob/v3/master/src/transaction.cc (toJSON)
      v3 nie zapisuje „Intercepted” — zablokowane = odpowiedź 403/406 (status odmowy reguł CRS/LiteSpeed).
    """
    out = []
    for l in tekst.splitlines():
        if not l.startswith("{"):
            continue
        try:
            j = json.loads(l)
        except ValueError:
            continue
        tr = j.get("transaction") or {}
        if isinstance(tr.get("request"), dict):
            rq, rs = tr.get("request") or {}, tr.get("response") or {}
            naglowki = rq.get("headers") or {}
            host = next((v for k, v in naglowki.items() if k.lower() == "host"), "") if isinstance(naglowki, dict) else ""
            d = domena_konta(str(host))
            r = regula_v3(tr.get("messages") or [])
            if not d or not r:
                continue
            kod = rs.get("http_code")
            metoda = str(rq.get("method") or "")
            out.append([czas_v3(tr.get("time_stamp")) or "-", d, ip_ok(str(tr.get("client_ip") or "")),
                        metoda if re.fullmatch(r"[A-Z]{3,10}", metoda) else "-",
                        czysc(str(rq.get("uri") or "").split("?", 1)[0], 200) or "/", r[0], czysc(r[1], 150),
                        "1" if kod in (403, 406) else "0", str(kod or "-")])
            continue
        rq, rs, ad = (j.get(k) or {} for k in ("request", "response", "audit_data"))
        naglowki = rq.get("headers") or {}
        host = next((v for k, v in naglowki.items() if k.lower() == "host"), "") if isinstance(naglowki, dict) else ""
        wiad = [x for x in (ad.get("messages") or []) if isinstance(x, str)]
        t = trafienie(czas_iso(tr.get("time")), host, tr.get("remote_address"), rq.get("request_line"), wiad,
                      bool((ad.get("action") or {}).get("intercepted")), rs.get("status"))
        if t:
            out.append(t)
    return out

if not os.path.exists(plik):
    fail("brak dziennika WAF na serwerze (ModSecurity nie zapisał jeszcze żadnego trafienia albo jest wyłączony)")
try:
    with open(plik, "rb") as f:
        f.seek(0, os.SEEK_END)
        rozmiar = f.tell()
        f.seek(max(0, rozmiar - BAJTOW))
        surowe = f.read()
except OSError as e:
    fail(f"nie udało się odczytać dziennika WAF ({e.strerror})")
tekst = surowe.decode("utf-8", errors="replace")
if rozmiar > BAJTOW:
    tekst = tekst.split("\n", 1)[1] if "\n" in tekst else ""

if re.search(r"^--[0-9A-Za-z]{8,32}-A--$", tekst, re.M):
    trafienia = serial(tekst)
elif re.search(r'^\{"transaction":', tekst, re.M):
    trafienia = jsonowy(tekst)
elif tekst.strip():
    fail("nieznany format dziennika WAF (oczekiwany Serial albo JSON z ModSecurity v2) — sprawdzić konfigurację SecAuditLog")
else:
    trafienia = []

# Audyt Fali 3 — wybór od najnowszych z budżetem w bajtach (ścieżka z bajtów spoza UTF-8 to U+FFFD = 3 bajty na znak),
# wypisane od najstarszego do najnowszego: obcięcie przez agenta (tail -c, od początku) zabiera najstarsze trafienia.
pokazane, bajty = [], 0
for t in reversed(trafienia):  # najnowsze najpierw
    if len(pokazane) >= LIMIT:
        break
    linia = "VERRIS_WAF " + "|".join(t)
    rozmiar = len(linia.encode("utf-8")) + 1
    if bajty + rozmiar > LIMIT_BAJTOW:
        break
    bajty += rozmiar
    pokazane.append(linia)
for l in reversed(pokazane):
    print(l)
print(f"VERRIS_WAF_RAZEM {len(trafienia)} {len(pokazane)} {len(surowe)}")
print("[waf-hits] Gotowe.")
PY

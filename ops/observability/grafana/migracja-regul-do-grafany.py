#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
X-28 — jednorazowa migracja regul alertowych z Prometheusa do Grafany.

Skrypt istnieje po to, zeby przepisanie 13 regul nie odbywalo sie recznie.
Po uruchomieniu zrodlowy alerts.yml znika (jeden dom dla reguly), a ten plik
zostaje w historii commita jako zapis, JAK powstal wynik.
"""
import yaml, re, json, sys

SRC = "ops/observability/prometheus/alerts.yml"  # plik usuniety po migracji
OUT = "ops/observability/grafana/provisioning/alerting/rules.yaml"

# Alerty, dla ktorych BRAK DANYCH ma znaczyc ALARM, a nie „wszystko dobrze".
#
# Domyslnie brak serii = warunek niespelniony = OK, bo prometheusowe `expr`
# z porownaniem zwraca pusty wynik, gdy jest dobrze. Ale dla kanarka od kopii
# bazy „metryka zniknela" i „kopia jest swieza" wygladaja identycznie — a to
# jest DOKLADNIE ten przypadek, ktory kosztowal nas miesiac bez kopii.
# `for: 30m` sprawia, ze restart API nie zapali alarmu.
BRAK_DANYCH_ALARMUJE = {"VerrisPostgresBackupStale"}


def uid(nazwa: str) -> str:
    """Stabilny, krotki identyfikator reguly. Grafana wymaga <= 40 znakow."""
    s = re.sub(r"(?<!^)(?=[A-Z])", "-", nazwa).lower()
    s = re.sub(r"[^a-z0-9-]", "-", s)
    return s[:40]


def regula(r: dict) -> dict:
    nazwa = r["alert"]
    return {
        "uid": uid(nazwa),
        "title": nazwa,
        "condition": "C",
        "data": [
            {
                "refId": "A",
                "relativeTimeRange": {"from": 600, "to": 0},
                "datasourceUid": "Prometheus",
                "model": {
                    "refId": "A",
                    "expr": r["expr"],
                    "instant": True,
                    "range": False,
                    "editorMode": "code",
                    "intervalMs": 1000,
                    "maxDataPoints": 43200,
                },
            },
            {
                # Prometheusowe `expr` juz zawiera porownanie, wiec zwraca 1 albo
                # nic. Prog `gt 0` jest tu tylko domknieciem wymaganym przez
                # Grafane — nie drugim, niezaleznym warunkiem.
                "refId": "C",
                "datasourceUid": "__expr__",
                "model": {
                    "refId": "C",
                    "type": "threshold",
                    "expression": "A",
                    "conditions": [
                        {
                            "evaluator": {"type": "gt", "params": [0]},
                            "operator": {"type": "and"},
                            "query": {"params": ["A"]},
                            "reducer": {"type": "last", "params": []},
                            "type": "query",
                        }
                    ],
                },
            },
        ],
        "for": r.get("for", "5m"),
        "noDataState": "Alerting" if nazwa in BRAK_DANYCH_ALARMUJE else "OK",
        "execErrState": "Alerting",
        "labels": dict(r.get("labels", {})),
        "annotations": dict(r.get("annotations", {})),
        "isPaused": False,
    }


src = yaml.safe_load(open(SRC, encoding="utf-8"))
grupy = []
for g in src["groups"]:
    grupy.append(
        {
            "orgId": 1,
            "name": g["name"],
            "folder": "Verris",
            "interval": g.get("interval", "1m"),
            "rules": [regula(r) for r in g["rules"]],
        }
    )

naglowek = """# X-28 — reguly alertowe zarzadzane przez Grafane.
#
# DLACZEGO TUTAJ, A NIE W PROMETHEUSIE. Do 2026-08-22 te same reguly stały
# w ops/observability/prometheus/alerts.yml. Prometheus je liczyl i pokazywal
# u siebie — i na tym sie konczylo: w calym repozytorium nie bylo Alertmanagera,
# a prometheus.yml nie mial sekcji `alerting:`. Piec regul z `severity: critical`,
# w tym VerrisPostgresBackupStale, nie mialo DOKAD trafic. Kopia bazy nie
# wykonala sie ani razu przez miesiac i alarm o tym zapalil sie poprawnie —
# w interfejsie, ktorego nikt nie otwiera.
#
# Grafana miala dokladnie odwrotny problem: punkt kontaktowy (dominik@hvln.pl),
# polityke powiadomien i dzialajacy SMTP — i ZERO regul. Dwie polowy jednego
# mechanizmu, kazda bezuzyteczna bez drugiej.
#
# JEDEN DOM, NIE DWA. Reguly nie zostaly skopiowane — zostaly PRZENIESIONE,
# a alerts.yml usuniety razem z `rule_files` w prometheus.yml. Kopiowanie
# dalo w tym projekcie Z-12, Z-16, M-06, X-24 i H-24: dwa egzemplarze jednej
# reguly, jeden poprawiony, drugi zapomniany. Prog zmieniony w jednym miejscu
# i niezmieniony w drugim bylby tu gorszy niz brak alertu, bo wygladalby na
# dzialajacy.
#
# Plik powstal z ops/observability/prometheus/alerts.yml skryptem
# ops/observability/grafana/migracja-regul-do-grafany.py. Skrypt zostaje
# w repo jako zapis, jak wynik powstal — nie jako narzedzie do powtarzania.
"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(naglowek)
    yaml.safe_dump(
        {"apiVersion": 1, "groups": grupy},
        f,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
        width=100,
    )

n = sum(len(g["rules"]) for g in grupy)
kryt = sum(1 for g in grupy for r in g["rules"] if r["labels"].get("severity") == "critical")
print(f"grup: {len(grupy)}, regul: {n}, critical: {kryt}")
print("uid-y:", [r["uid"] for g in grupy for r in g["rules"]])

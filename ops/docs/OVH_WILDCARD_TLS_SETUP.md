# Wildcard TLS `*.verris.pl` — konfiguracja OVH (DNS-01)

> Cert wildcard pokrywa `node-pl-01.verris.pl`, `api.verris.pl`, itd.  
> **Nie pokrywa surowego IP** (`https://62.238.0.223:2222` zawsze będzie błędem — używaj hostname węzła).

## 1. Dlaczego widzisz „Connection Is Not Private”?

| Adres | Wynik |
|-------|--------|
| `https://node-pl-01.verris.pl:2222` | OK (cert na hostname) |
| `https://62.238.0.223:2222` | **Błąd** — cert nie jest wydany na IP |

Panel klienta linkuje przez `server.hostname` (`node-pl-01.verris.pl`). Wejdź przez hostname, nie IP.

---

## 2. Klucze API OVH (jednorazowo, ~5 min)

1. Zaloguj się: [OVHcloud API credentials](https://api.ovh.com/createToken/)  
   *(lub Manager → moje konto → **Klucze API** → **Utwórz klucze API**)*

2. **Opis:** `verris-wildcard-tls`

3. **Prawa minimalne (certbot / rekordy strefy):**

   | Metoda | Ścieżka |
   |--------|---------|
   | GET | `/domain/zone/*` |
   | POST | `/domain/zone/*` |
   | PUT | `/domain/zone/*` |
   | DELETE | `/domain/zone/*` |

   **Automat NS w panelu** wymaga dodatkowo glue na domenie — patrz
   [`OVH_NODE_NS_AUTOMATION.md`](./OVH_NODE_NS_AUTOMATION.md) (POST `/domain/verris.pl/glueRecord`).
   Możesz użyć **jednego** consumer key z oboma zestawami praw.

4. Zapisz trzy wartości:
   - **Application key** → `OVH_APP_KEY`
   - **Application secret** → `OVH_APP_SECRET`
   - **Consumer key** → `OVH_CONSUMER_KEY`

5. **Nie commituj** tych wartości do repo.

---

## 3. Wydanie certu na Node-PL-01

SSH na węzeł (klucz deploy już dodany):

```bash
export OVH_APP_KEY='...'
export OVH_APP_SECRET='...'
export OVH_CONSUMER_KEY='...'
export CERTBOT_EMAIL='admin@verris.pl'

bash /root/node-wildcard-tls-ovh.sh
```

Albo z Maca (skrypt z repo):

```bash
scp -i ~/.ssh/verris_cursor_deploy ops/scripts/node-wildcard-tls-ovh.sh root@62.238.0.223:/root/
ssh -i ~/.ssh/verris_cursor_deploy root@62.238.0.223 \
  'OVH_APP_KEY=... OVH_APP_SECRET=... OVH_CONSUMER_KEY=... CERTBOT_EMAIL=admin@verris.pl bash /root/node-wildcard-tls-ovh.sh'
```

Skrypt:
- instaluje `certbot` + `python3-certbot-dns-ovh`
- wydaje `*.verris.pl` + `verris.pl` (Let's Encrypt DNS-01)
- instaluje cert w DirectAdmin (`:2222`)
- włącza auto-odnawianie + hook deploy

---

## 4. Weryfikacja

```bash
dig +short node-pl-01.verris.pl A
# → 62.238.0.223

curl -vI https://node-pl-01.verris.pl:2222/ 2>&1 | grep -E 'subject:|issuer:|SSL certificate verify'
# subject: CN=*.verris.pl (lub verris.pl w SAN)
# SSL certificate verify ok
```

W panelu klienta: **Health → Panel DA (TLS)** powinien być zielony.

---

## 5. Control-plane (wiele węzłów) — **docelowy model**

Wildcard wystawiany **centralnie na serwerze panelu**, deploy SSH na wszystkie ACTIVE węzły:

```bash
bash /opt/verris/ops/scripts/verris-node-wildcard-tls-bootstrap.sh   # jednorazowo
bash /opt/verris/ops/scripts/verris-node-wildcard-tls.sh             # renew + deploy
```

Patrz **[NODE_WILDCARD_TLS.md](./NODE_WILDCARD_TLS.md)**.

## 6. Awaryjnie: pojedynczy węzeł (bez CP)

Tylko gdy control-plane niedostępny — `ops/scripts/node-wildcard-tls-ovh.sh` na węźle.

---

## Powiązane

- [`NODE_WILDCARD_TLS.md`](./NODE_WILDCARD_TLS.md)
- [`OVH_DNS_VERRIS_PL.md`](../../docs/ops/OVH_DNS_VERRIS_PL.md)

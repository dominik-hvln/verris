# SSH — produkcja Verris (Cursor, Termius, operator)

> **Nie commituj** plików prywatnych (`~/.ssh/verris_*` bez `.pub`) do repozytorium.

## Serwery

| Rola | Host | IP | SSH z internetu |
|------|------|-----|-----------------|
| Control-plane (panel, API) | `Panel` | `204.168.174.138` | tak, port **22** |
| Węzeł hostingowy | `node-pl-01.verris.pl` | `62.238.0.223` | **nie** — tylko z panelu (jump) lub sieć wewnętrzna |

---

# Klucz control-plane → węzły

Klucz Cursor Agent wycofany 2026-09-23 (Cursor nie jest już używany; ta sama
prywatna część leżała na laptopie i na panelu). Zamiast niego:

- para `/root/.ssh/verris_node_deploy` generowana **na panelu**, prywatna część
  nigdy go nie opuszcza;
- pubkey w `VERRIS_NODE_DEPLOY_SSH_PUBKEY` (`.env.prod`) — bootstrap i agent
  `verris-tasks` wgrywają go do `authorized_keys` roota każdego węzła;
- operator wchodzi na węzeł przez panel: Termius → panel → `verris-node ssh <węzeł>`.

Agent tylko dopisuje klucz (nie usuwa starych) — przy rotacji na działających
węzłach usuń starą linię ręcznie: `verris-node exec <węzeł> -- "sed -i '/<komentarz>/d' /root/.ssh/authorized_keys"`.

---

# SSH — klucz Termius (operator z telefonu / Maca)

Osobna para do ręcznego logowania (Termius, Terminal). Na serwerach linia w `authorized_keys` ma komentarz `# verris-termius`.

## Pliki lokalne (Mac)

| Plik | Uprawnienia |
|------|-------------|
| `~/.ssh/verris_termius` | prywatny — `chmod 600`, import w Termius |
| `~/.ssh/verris_termius.pub` | publiczny |

Wygenerowanie (gdy brak pliku):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/verris_termius -N "" -C "termius-admin@verris-prod"
chmod 600 ~/.ssh/verris_termius
chmod 644 ~/.ssh/verris_termius.pub
```

## Wgranie pubkey na panel i węzeł

Gdy masz już działający deploy z innego klucza (np. `verris_cursor_deploy`):

```bash
PUB="$(cat ~/.ssh/verris_termius.pub)"
MARKER="# verris-termius"

# Panel
ssh -i ~/.ssh/verris_cursor_deploy root@204.168.174.138 \
  "grep -qF '$MARKER' /root/.ssh/authorized_keys || echo '$PUB $MARKER' >> /root/.ssh/authorized_keys"

# Węzeł (przez jump z panelu)
ssh -i ~/.ssh/verris_cursor_deploy root@204.168.174.138 \
  "ssh -i /root/.ssh/verris_node_deploy root@62.238.0.223 \
     \"mkdir -p /root/.ssh; grep -qF '$MARKER' /root/.ssh/authorized_keys || echo '$PUB $MARKER' >> /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys\""
```

Z **KVM** (gdy SSH z Maca nie działa): wklej całą linię z `cat ~/.ssh/verris_termius.pub` do `/root/.ssh/authorized_keys` na panelu i węźle.

## Test z Maca

```bash
# Panel
ssh -i ~/.ssh/verris_termius root@204.168.174.138 'hostname'

# Węzeł (z panelu)
ssh -i ~/.ssh/verris_termius root@204.168.174.138 \
  'ssh -i /root/.ssh/verris_node_deploy root@62.238.0.223 hostname'
```

## Termius — konfiguracja

### 1. Import klucza

- **Keys** → **Import** → wybierz plik `~/.ssh/verris_termius`  
  (albo wklej zawartość pliku prywatnego — trzymaj go tylko u siebie).
- Nazwa np. `Verris Termius`.

### 2. Host: Verris Panel

| Pole | Wartość |
|------|---------|
| Address | `204.168.174.138` |
| Port | `22` |
| Username | `root` |
| Key | `Verris Termius` |

### 3. Host: Verris Node (jump)

Port 22 na węźle **nie jest** otwarty z całego internetu — ustaw **Proxy / Jump host** na profil **Verris Panel** (ten sam klucz).

| Pole | Wartość |
|------|---------|
| Address | `62.238.0.223` |
| Port | `22` |
| Username | `root` |
| Key | `Verris Termius` |
| Proxy / Jump | `Verris Panel` |

Alternatywa: jedna sesja na panelu, potem `ssh root@62.238.0.223`.

## Connection refused / fail2ban

Jeśli panel odrzuca port 22, a w KVM `sshd` działa i UFW ma `allow 22/tcp`, sprawdź ban:

```bash
fail2ban-client status sshd
fail2ban-client set sshd unbanip TWOJE.IP
```

Whitelist (opcjonalnie) — `/etc/fail2ban/jail.d/verris-ignore.local`:

```ini
[sshd]
ignoreip = 127.0.0.1/8 ::1 TWOJE.IP.Z.MACA
```

## Rotacja / revoke (Termius)

Usuń linię z `# verris-termius` z `/root/.ssh/authorized_keys` na panelu i węźle, wygeneruj nową parę i powtórz wgranie.

# SSH — produkcja Verris (Cursor, Termius, operator)

> **Nie commituj** plików prywatnych (`~/.ssh/verris_*` bez `.pub`) do repozytorium.

## Serwery

| Rola | Host | IP | SSH z internetu |
|------|------|-----|-----------------|
| Control-plane (panel, API) | `Panel` | `204.168.174.138` | tak, port **22** |
| Węzeł hostingowy | `node-pl-01.verris.pl` | `62.238.0.223` | **nie** — tylko z panelu (jump) lub sieć wewnętrzna |

---

# SSH deploy — klucz Cursor Agent

> Klucz wyłącznie do automatycznego deployu z Cursora.

## Pliki lokalne (Mac)

| Plik | Uprawnienia |
|------|-------------|
| `~/.ssh/verris_cursor_deploy` | prywatny — `chmod 600` |
| `~/.ssh/verris_cursor_deploy.pub` | publiczny — można pokazać |

## Wgranie na prod (jednorazowo)

Zaloguj się na serwer **swoim** dotychczasowym kluczem/hasłem, potem jako `root`:

```bash
mkdir -p /root/.ssh
chmod 700 /root/.ssh

# Wklej CAŁĄ linię z verris_cursor_deploy.pub (zaczyna się od ssh-ed25519):
echo 'WKLEJ_TUTAJ_JEDNĄ_LINIĘ_PUBKEY' >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

# Opcjonalnie: tylko ten klucz + Twoje istniejące (nie nadpisuj pliku ślepo)
```

Albo z Maca (gdy masz już SSH):

```bash
ssh-copy-id -i ~/.ssh/verris_cursor_deploy.pub root@204.168.174.138
```

## Test z Maca

```bash
ssh -i ~/.ssh/verris_cursor_deploy -o BatchMode=yes root@204.168.174.138 'hostname && cd /opt/verris && git log -1 --oneline'
```

## Po wgraniu

Napisz w Cursorze „deploy na prod” — agent użyje `-i ~/.ssh/verris_cursor_deploy`.

**Nowe węzły:** ten sam pubkey jest automatycznie dodawany do `authorized_keys` podczas bootstrapu Verris (wymaga `VERRIS_NODE_DEPLOY_SSH_PUBKEY` w `.env.prod` API). Ręczne dodawanie na węzłach nie jest potrzebne.

## Rotacja / revoke

Usuń odpowiadającą linię z `/root/.ssh/authorized_keys` na serwerze i wygeneruj nową parę kluczy.

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

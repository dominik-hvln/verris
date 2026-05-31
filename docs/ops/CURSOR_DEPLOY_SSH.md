# SSH deploy — klucz Cursor Agent

> Klucz wyłącznie do automatycznego deployu z Cursora. **Nie commituj** pliku prywatnego do repo.

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

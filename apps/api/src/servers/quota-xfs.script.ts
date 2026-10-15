/**
 * Decyzja 15.10 (PB-31: od czystego systemu do zielonego raportu bez ręcznego SSH) — quota XFS włączana
 * automatycznie. Ta sama funkcja jest w bootstrapie (faza QUOTA, z restartem wznawianym przez systemd) i w profilu
 * hostingowym (ops/scripts/node-hosting-profile.sh — ustawia, restartu nie robi, bo węzeł może mieć klientów).
 * Zgodność obu kopii pilnuje test quota-xfs.spec.ts.
 */
export const QUOTA_XFS_SH = String.raw`# Limity dysku kont: DirectAdmin egzekwuje dysk przez quota systemu plików partycji kont
# (https://docs.directadmin.com/operation-system-level/os-general/filesystems-and-quotas.html). XFS nie włącza
# quota przy ponownym montowaniu: partycja główna — opcja jądra rootflags=uquota,pquota (grubby dla obecnych jąder,
# GRUB_CMDLINE_LINUX dla kolejnych), inna partycja XFS — uquota,pquota w /etc/fstab. Działa po restarcie.
# Użycie: wlacz_quota_xfs <katalog kont> [fstab] [plik grub]. Kod: 0 — quota aktywna; 2 — nie XFS (bez zmian); 10 — ustawione, potrzebny restart; 1 — błąd.
wlacz_quota_xfs() {
  local cel="$1" mnt typ opcje fstab=/etc/fstab grub=/etc/default/grub
  [ "$#" -ge 2 ] && fstab="$2"
  [ "$#" -ge 3 ] && grub="$3"
  mnt="$(findmnt -no TARGET --target "$cel" 2>/dev/null | head -1)"
  [ -n "$mnt" ] || mnt=/
  typ="$(findmnt -no FSTYPE --target "$mnt" 2>/dev/null | head -1)"
  [ "$typ" = xfs ] || return 2
  opcje="$(findmnt -no OPTIONS --target "$mnt" 2>/dev/null | head -1)"
  case ",$opcje," in *,usrquota,*|*,uquota,*) return 0 ;; esac
  if [ "$mnt" = / ]; then
    grubby --update-kernel=ALL --args="rootflags=uquota,pquota" || return 1
    if [ -f "$grub" ] && ! grep -q 'rootflags=uquota,pquota' "$grub"; then
      sed -i 's/^GRUB_CMDLINE_LINUX="\(.*\)"$/GRUB_CMDLINE_LINUX="\1 rootflags=uquota,pquota"/' "$grub" || return 1
    fi
  else
    python3 - "$fstab" "$mnt" <<'PYFSTAB' || return 1
import sys
plik, mnt = sys.argv[1], sys.argv[2]
linie = open(plik).read().split('\n')
jest = False
for i, l in enumerate(linie):
    p = l.split()
    if len(p) >= 4 and not p[0].startswith('#') and p[1] == mnt and p[2] == 'xfs':
        o = [x for x in p[3].split(',') if x != 'noquota']
        o += [x for x in ('uquota', 'pquota') if x not in o]
        p[3] = ','.join(o)
        linie[i] = '\t'.join(p)
        jest = True
if not jest:
    sys.exit('brak wpisu xfs dla ' + mnt + ' w ' + plik)
open(plik, 'w').write('\n'.join(linie))
PYFSTAB
  fi
  return 10
}
`;

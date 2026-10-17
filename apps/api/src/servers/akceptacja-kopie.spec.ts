import { ServersService } from './servers.service.js';
import { BackupOffsiteService } from './backup-offsite.service.js';

/** 17.10 (PB-31): akceptacja wybierała Onboard LIVE tylko wg zestawu floty — bez „tylko per węzeł” i wpisu węzła. */
function kopie(o: { wezla: boolean; floty: boolean; tylkoPerWezel: boolean }) {
  const b = Object.create(BackupOffsiteService.prototype) as BackupOffsiteService;
  Object.assign(b, {
    wczytajWezla: async () => (o.wezla ? { k: {} } : null),
    wczytaj: async () => (o.floty ? { k: {} } : null),
    tylkoPerWezel: async () => o.tylkoPerWezel,
  });
  return b;
}

function akceptuj(b: BackupOffsiteService) {
  const nodeTasks = { queueOnboardLive: vi.fn(async () => undefined), queueHostingProfile: vi.fn(async () => undefined) };
  const prisma = {
    server: {
      findUnique: vi.fn(async () => ({ id: 's1', status: 'PENDING_APPROVAL', hostname: 'n1.verris.pl', bootstrapPhase: 'DONE' })),
      update: vi.fn(async ({ data }: { data: object }) => ({ id: 's1', ...data })),
    },
  };
  const s = new ServersService(
    prisma as never, null as never, { record: vi.fn(async () => undefined) } as never, null as never, null as never, null as never, null as never,
    { tryAutoProvision: vi.fn(async () => undefined) } as never, nodeTasks as never, b,
  );
  return { s, nodeTasks };
}

it.each([
  [{ wezla: true, floty: false, tylkoPerWezel: true }, 'onboard'],
  [{ wezla: false, floty: true, tylkoPerWezel: false }, 'onboard'],
  [{ wezla: false, floty: true, tylkoPerWezel: true }, 'profil'],
  [{ wezla: false, floty: false, tylkoPerWezel: false }, 'profil'],
])('kopie %o → %s', async (o, oczekiwane) => {
  const { s, nodeTasks } = akceptuj(kopie(o));
  await s.approveServer('s1', 'u1');
  expect(nodeTasks.queueOnboardLive).toHaveBeenCalledTimes(oczekiwane === 'onboard' ? 1 : 0);
  expect(nodeTasks.queueHostingProfile).toHaveBeenCalledTimes(oczekiwane === 'profil' ? 1 : 0);
});

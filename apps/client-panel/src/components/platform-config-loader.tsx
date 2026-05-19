'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { SessionIdleGuard } from './session-idle-guard';

type ClientPlatformConfig = {
  clientIdleSessionMinutes: number;
};

export function PlatformConfigLoader() {
  const [idleMinutes, setIdleMinutes] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<ClientPlatformConfig>('/platform-settings/client')
      .then((cfg) => setIdleMinutes(cfg.clientIdleSessionMinutes))
      .catch(() => setIdleMinutes(60));
  }, []);

  if (idleMinutes == null) return null;
  return <SessionIdleGuard idleMinutes={idleMinutes} />;
}

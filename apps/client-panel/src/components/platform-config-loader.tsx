'use client';

import { useEffect, useState } from 'react';
import { fetchClientPlatformConfig } from '@/app/dashboard/platform-actions';
import { SessionIdleGuard } from './session-idle-guard';

export function PlatformConfigLoader() {
  const [idleMinutes, setIdleMinutes] = useState<number | null>(null);

  useEffect(() => {
    fetchClientPlatformConfig()
      .then((cfg) => setIdleMinutes(cfg.clientIdleSessionMinutes))
      .catch(() => setIdleMinutes(60));
  }, []);

  if (idleMinutes == null) return null;
  return <SessionIdleGuard idleMinutes={idleMinutes} />;
}

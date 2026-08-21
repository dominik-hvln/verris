'use client';

import { useEffect, useState } from 'react';
import { fetchAdminPlatformConfig } from '@/lib/platform-actions';
import { SessionIdleGuard } from './session-idle-guard';

export function PlatformConfigLoader() {
  const [idleMinutes, setIdleMinutes] = useState<number | null>(null);

  useEffect(() => {
    fetchAdminPlatformConfig()
      .then((cfg) => setIdleMinutes(cfg.adminIdleSessionMinutes))
      .catch(() => setIdleMinutes(15));
  }, []);

  if (idleMinutes == null) return null;
  return <SessionIdleGuard idleMinutes={idleMinutes} />;
}

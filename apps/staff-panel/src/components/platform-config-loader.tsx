'use client';

import { useEffect, useState } from 'react';
import { fetchStaffPlatformConfig } from '@/lib/platform-actions';
import { SessionIdleGuard } from './session-idle-guard';

export function PlatformConfigLoader() {
  const [idleMinutes, setIdleMinutes] = useState<number | null>(null);

  useEffect(() => {
    fetchStaffPlatformConfig()
      .then((cfg) => setIdleMinutes(cfg.staffIdleSessionMinutes))
      .catch(() => setIdleMinutes(30));
  }, []);

  if (idleMinutes == null) return null;
  return <SessionIdleGuard idleMinutes={idleMinutes} />;
}

'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

/** Powiadomienia w motywie panelu: śledzi <html data-vtheme> (przełącznik w pasku górnym). */
export function ThemedToaster() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setLight(el.dataset.vtheme === 'light');
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-vtheme'] });
    return () => obs.disconnect();
  }, []);
  return <Toaster theme={light ? 'light' : 'dark'} position="bottom-right" />;
}

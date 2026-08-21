'use client';

import { useEffect } from 'react';

// Odsłanianie sekcji przy scrollu (.rv → .in). Zastępuje inline-script z prototypu.
export function RevealInit() {
  useEffect(() => {
    const els = document.querySelectorAll('.rv');
    if (!('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  return null;
}

'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/') return;

    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      router.refresh();
    };

    const intervalId = window.setInterval(refresh, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [intervalMs, pathname, router]);

  return null;
}

import { useLayoutEffect, useRef } from 'react';
import { createIcon } from '../shared/components/icons.js';

/** Reuse the pinned Lucide whitelist; React never accepts icon markup from data. */
export function Icon({ name, className = '' }: { name: string; className?: string }) {
  const host = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const icon = createIcon(document, name, className);
    host.current?.append(icon);
    return () => icon.remove();
  }, [name, className]);
  return <span ref={host} className="settings-icon" aria-hidden="true" />;
}

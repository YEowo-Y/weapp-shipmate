import { createElement } from 'react';
import { iconNodes } from '../shared/components/lucide-icons.js';
import { cn } from '../lib/utils';

type IconName = keyof typeof iconNodes | (string & {});

export function LucideSvg({ name, size = 'md', className }: { name: IconName; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const entries = Object.hasOwn(iconNodes, name) ? (iconNodes as Record<string, unknown[][]>)[name] : [];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn(
        'shell-ic',
        size === 'sm' && 'shell-ic--sm',
        size === 'lg' && 'shell-ic--lg',
        className,
      )}
    >
      {entries.map((entry, index) => {
        const [tag, attrs] = entry;
        if (typeof tag !== 'string' || !attrs || typeof attrs !== 'object') return null;
        return createElement(tag, { ...(attrs as Record<string, string>), key: index });
      })}
    </svg>
  );
}

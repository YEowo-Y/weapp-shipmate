import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const merge = extendTailwindMerge({ prefix: 'tw' });
export function cn(...values: ClassValue[]) { return merge(clsx(values)); }

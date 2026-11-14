// Adapted from shadcn/ui base-nova Button (MIT), retrieved 2026-10-25.
// https://ui.shadcn.com/r/styles/base-nova/button.json
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'settings-button tw:inline-flex tw:shrink-0 tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:text-sm tw:font-medium tw:select-none tw:disabled:pointer-events-none tw:disabled:opacity-50',
  { variants: { variant: { default: 'settings-button--default', outline: 'settings-button--outline', ghost: 'settings-button--ghost' } }, defaultVariants: { variant: 'ghost' } },
);
export function Button({ className, variant = 'ghost', ...props }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return <ButtonPrimitive data-slot="button" className={cn(buttonVariants({ variant }), className)} {...props} />;
}

// Adapted from shadcn/ui base-nova Radio Group (MIT), retrieved 2026-10-25.
// https://ui.shadcn.com/r/styles/base-nova/radio-group.json
// The project uses labeled choice cards instead of a circular indicator.
import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { cn } from '../../lib/utils';

export function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn('tw:flex tw:flex-wrap tw:gap-1', className)} {...props} />;
}
export function RadioGroupItem({ className, children, ...props }: RadioPrimitive.Root.Props) {
  return <RadioPrimitive.Root data-slot="radio-group-item" className={cn('preferences-choice tw:relative tw:disabled:cursor-not-allowed tw:disabled:opacity-50', className)} {...props}>
    {children}
  </RadioPrimitive.Root>;
}

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { cn } from '../../lib/utils';
import { LucideSvg } from '../../shell/lucide-svg';

export function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn('ui-checkbox', className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="ui-checkbox__indicator">
        <LucideSvg name="check" size="sm" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

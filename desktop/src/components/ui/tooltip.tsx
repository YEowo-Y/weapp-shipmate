import type { ReactNode } from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { cn } from '../../lib/utils';

export function TooltipProvider({ delay = 200, closeDelay = 80, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={delay} closeDelay={closeDelay} {...props} />;
}

export function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

export function TooltipTrigger({ className, ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" className={cn('ui-tooltip__trigger', className)} {...props} />;
}

export function TooltipContent({
  className,
  sideOffset = 6,
  side = 'bottom',
  align = 'end',
  children,
  ...props
}: TooltipPrimitive.Popup.Props & {
  sideOffset?: TooltipPrimitive.Positioner.Props['sideOffset'];
  side?: TooltipPrimitive.Positioner.Props['side'];
  align?: TooltipPrimitive.Positioner.Props['align'];
  children?: ReactNode;
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} className="ui-tooltip__positioner">
        <TooltipPrimitive.Popup data-slot="tooltip-content" className={cn('ui-tooltip__popup', className)} {...props}>
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

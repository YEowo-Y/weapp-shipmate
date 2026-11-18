import type { ReactNode } from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { cn } from '../../lib/utils';

export function DropdownMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

export function DropdownMenuTrigger({ className, ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" className={cn('ui-dropdown__trigger', className)} {...props} />;
}

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  side = 'bottom',
  align = 'end',
  children,
  ...props
}: MenuPrimitive.Popup.Props & {
  sideOffset?: MenuPrimitive.Positioner.Props['sideOffset'];
  side?: MenuPrimitive.Positioner.Props['side'];
  align?: MenuPrimitive.Positioner.Props['align'];
  children?: ReactNode;
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} className="ui-dropdown__positioner">
        <MenuPrimitive.Popup data-slot="dropdown-menu-content" className={cn('ui-dropdown__popup', className)} {...props}>
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return <MenuPrimitive.Item data-slot="dropdown-menu-item" className={cn('ui-dropdown__item', className)} {...props} />;
}

export function DropdownMenuGroup({ className, ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" className={cn('ui-dropdown__group', className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return <MenuPrimitive.GroupLabel data-slot="dropdown-menu-label" className={cn('ui-dropdown__label', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return <MenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn('ui-dropdown__separator', className)} {...props} />;
}

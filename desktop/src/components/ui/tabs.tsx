import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from '../../lib/utils';

export function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('ui-tabs', className)} {...props} />;
}

export function TabsList({ className, activateOnFocus = true, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      activateOnFocus={activateOnFocus}
      className={cn('ui-tabs__list', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return <TabsPrimitive.Tab data-slot="tabs-trigger" className={cn('ui-tabs__trigger', className)} {...props} />;
}

export function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return <TabsPrimitive.Indicator data-slot="tabs-indicator" className={cn('ui-tabs__indicator', className)} {...props} />;
}

export function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('ui-tabs__panel', className)} {...props} />;
}

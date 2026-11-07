import { createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SettingsView } from './view';

export function createSettingsRenderer(dialog: HTMLDialogElement) {
  const root = createRoot(dialog);
  return {
    render(props: ComponentProps<typeof SettingsView>, visit: number) {
      flushSync(() => root.render(createElement(SettingsView, { ...props, key: visit })));
    },
    destroy() { root.unmount(); },
  };
}

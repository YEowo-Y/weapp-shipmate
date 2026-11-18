import { Channel, invoke } from '@tauri-apps/api/core';
import { createDesktopModelFetch } from './shared/desktop-model-fetch.js';

export const desktopModelFetch = createDesktopModelFetch({ invoke, createChannel: () => new Channel() });
window.addEventListener('pagehide', () => desktopModelFetch.dispose());

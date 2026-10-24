import { createIcon } from './icons.js';

// Vendored, pinned assets only. Provider data cannot supply markup or URLs.
const BRANDS = new Set(['openai', 'anthropic', 'google', 'ollama', 'openrouter']);
const LOCAL_ICONS = Object.freeze({ 'local-demo': 'bot', custom: 'sliders-horizontal' });

export function createProviderIcon(document, providerId) {
  const icon = document.createElement('span');
  icon.className = 'provider-brand';
  icon.setAttribute('aria-hidden', 'true');
  if (BRANDS.has(providerId)) {
    icon.dataset.provider = providerId;
    if (providerId === 'google') {
      const image = document.createElement('img');
      image.src = new URL('./brands/google-color.svg', import.meta.url).href;
      image.alt = '';
      image.width = 24;
      image.height = 24;
      image.draggable = false;
      icon.append(image);
    }
  } else if (Object.hasOwn(LOCAL_ICONS, providerId)) {
    icon.append(createIcon(document, LOCAL_ICONS[providerId]));
  } else {
    throw new Error('Unknown provider icon');
  }
  return icon;
}

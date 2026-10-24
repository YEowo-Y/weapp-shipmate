import { iconNodes } from './lucide-icons.js';

const attributes = {
  viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none',
  stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round',
  'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
};
function nodes(name) {
  if (!Object.hasOwn(iconNodes, name)) throw new TypeError(`Unknown icon: ${name}`);
  return iconNodes[name];
}

/** Decorative icons: the enclosing control owns its accessible name. */
export function createIcon(doc, name, className = '') {
  const children = nodes(name);
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  svg.setAttribute('class', `app-icon ${className}`.trim());
  for (const [tag, attrs] of children) {
    const child = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) child.setAttribute(key, value);
    svg.append(child);
  }
  return svg;
}

const escapeAttribute = value => String(value).replace(/[&"<>]/g, char => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[char]);
const serializeAttributes = attrs => Object.entries(attrs).map(([key, value]) => `${key}="${escapeAttribute(value)}"`).join(' ');

/** Only renders the pinned whitelist; never accepts markup from model output. */
export function iconMarkup(name, className = '') {
  const children = nodes(name).map(([tag, attrs]) => `<${tag} ${serializeAttributes(attrs)}></${tag}>`).join('');
  return `<svg ${serializeAttributes({ ...attributes, class: `app-icon ${className}`.trim() })}>${children}</svg>`;
}

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the production factory without loading browser-only custom elements.
// Native form association and shadow focus are covered in browser/native E2E.
const source = readFileSync(new URL('../../desktop/src/shared/components/ui-kit.js', import.meta.url), 'utf8');
const factory = source.match(/^export function createActionButton\([^]*?^}/m)?.[0];
if (!factory) throw new Error('Action button factory is missing');
export const createActionButton = vm.runInNewContext(`(${factory.replace(/^export /, '')})`);
const menuFactory = source.match(/^export function bindActionMenu\([^]*?^}/m)?.[0];
if (!menuFactory) throw new Error('Action menu binding is missing');
export const bindActionMenu = vm.runInNewContext(`(${menuFactory.replace(/^export /, '')})`);

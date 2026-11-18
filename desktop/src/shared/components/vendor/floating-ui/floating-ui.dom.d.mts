export type Placement = string;
export type Middleware = { name: string; options?: unknown; fn: (state: Record<string, unknown>) => unknown };
export function offset(value?: number | Record<string, unknown>): Middleware;
export function flip(options?: Record<string, unknown>): Middleware;
export function shift(options?: Record<string, unknown>): Middleware;
export function size(options?: {
  padding?: number;
  apply?: (args: {
    availableWidth: number;
    availableHeight: number;
    rects: { reference: { width: number; height: number; x: number; y: number }; floating: { width: number; height: number; x: number; y: number } };
    elements: { floating: HTMLElement };
  }) => void;
}): Middleware;
export function computePosition(
  reference: Element,
  floating: HTMLElement,
  options?: { placement?: Placement; strategy?: 'absolute' | 'fixed'; middleware?: Middleware[] },
): Promise<{ x: number; y: number; placement: string; strategy: string; middlewareData: Record<string, unknown> }>;
export function autoUpdate(reference: Element, floating: HTMLElement, update: () => void): () => void;

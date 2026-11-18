export interface MarkdownToken {
  type: string;
  tag: string;
  attrs: [string, string][] | null;
  content: string;
  children: MarkdownToken[] | null;
  info: string;
  markup: string;
  nesting: number;
  level: number;
  attrGet(name: string): string | null;
}
export default class MarkdownIt {
  constructor(presetName?: string | Record<string, unknown>, options?: Record<string, unknown>);
  parse(src: string, env?: Record<string, unknown>): MarkdownToken[];
  disable(names: string | string[], ignoreInvalid?: boolean): this;
  enable(names: string | string[], ignoreInvalid?: boolean): this;
}

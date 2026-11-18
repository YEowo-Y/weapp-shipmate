// Minimal Node >=20 environment declarations for desktop server/scripts typecheck (zero @types/node dependency).
interface ImportMeta {
  url: string;
}

declare var process: {
  env: Record<string, string | undefined>;
  argv: string[];
  cwd(): string;
  platform: string;
  arch: string;
  exit(code?: number): never;
  exitCode?: number;
  stdin: AsyncIterable<Uint8Array> & {
    setEncoding?(enc: string): void;
    on(event: string, cb: (...args: any[]) => void): any;
    once(event: string, cb: (...args: any[]) => void): any;
    destroy(): void;
    resume(): void;
  };
  stdout: {
    write(chunk: string | Uint8Array): boolean;
    on(event: string, cb: (...args: any[]) => void): any;
  };
  stderr: {
    write(chunk: string | Uint8Array): boolean;
    on?(event: string, cb: (...args: any[]) => void): any;
  };
  on(event: string, cb: (...args: any[]) => void): any;
  once(event: string, cb: (...args: any[]) => void): any;
};

declare class Buffer extends Uint8Array {
  static from(input: string | ArrayBuffer | ArrayLike<number>, encoding?: string): Buffer;
  static concat(list: readonly Uint8Array[], totalLength?: number): Buffer;
  static byteLength(string: string | Uint8Array, encoding?: string): number;
  static isBuffer(obj: unknown): obj is Buffer;
  toString(encoding?: string, start?: number, end?: number): string;
}

declare var console: {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};
declare function setTimeout(cb: (...args: any[]) => void, ms?: number): any;
declare function clearTimeout(id: any): void;
declare function setInterval(cb: (...args: any[]) => void, ms?: number): any;
declare function clearInterval(id: any): void;
declare function fetch(input: string | URL | Request, init?: any): Promise<any>;

declare class Headers {
  constructor(init?: any);
  get(name: string): string | null;
  set(name: string, value: string): void;
  has(name: string): boolean;
  entries(): IterableIterator<[string, string]>;
  forEach(cb: (value: string, key: string) => void): void;
}
declare class Request {
  constructor(input: string | URL, init?: any);
}
declare class Response {
  constructor(body?: any, init?: { status?: number; statusText?: string; headers?: any });
  readonly ok: boolean;
  readonly status: number;
  readonly redirected?: boolean;
  readonly headers: Headers;
  readonly body: any;
  json(): Promise<any>;
  text(): Promise<string>;
}
declare class ReadableStream<R = any> {
  constructor(underlyingSource?: any);
  getReader(): any;
  pipeThrough<T = any>(transform: any, options?: any): ReadableStream<T>;
  cancel(reason?: any): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterableIterator<R>;
}
declare class TransformStream<I = any, O = any> {
  constructor(transformer?: any);
  readonly readable: ReadableStream<O>;
  readonly writable: any;
}
declare class AbortController {
  readonly signal: AbortSignal;
  abort(reason?: any): void;
  [key: string]: any;
}
declare interface AbortSignal {
  readonly aborted: boolean;
  readonly reason: any;
  addEventListener(type: string, listener: (...args: any[]) => void, options?: any): void;
  removeEventListener(type: string, listener: (...args: any[]) => void, options?: any): void;
}
declare namespace AbortSignal {
  function timeout(ms: number): AbortSignal;
  function any(signals: AbortSignal[]): AbortSignal;
}
declare class URL {
  constructor(url: string | URL, base?: string | URL);
  href: string;
  origin: string;
  protocol: string;
  username: string;
  password: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  readonly searchParams: URLSearchParams;
  hash: string;
  toString(): string;
}
declare class URLSearchParams {
  constructor(init?: any);
  get(name: string): string | null;
  set(name: string, value: string): void;
  has(name: string): boolean;
  toString(): string;
}
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean });
  decode(input?: BufferSource, options?: { stream?: boolean }): string;
}

declare module 'node:crypto' {
  export function createHash(algorithm: string): { update(data: string | Uint8Array): any; digest(encoding: 'hex' | 'base64' | 'base64url'): string; digest(): Buffer };
  export function randomBytes(size: number): Buffer;
  export function randomUUID(): string;
  export function timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean;
}
declare module 'node:fs' {
  export function existsSync(path: string | URL): boolean;
  export function readFileSync(path: string | URL, options?: any): any;
  export function writeFileSync(path: string | URL, data: string | Uint8Array, options?: any): void;
  export function readdirSync(path: string | URL, options?: any): any[];
  export function statSync(path: string | URL, options?: any): any;
  export function lstatSync(path: string | URL, options?: any): any;
  export const realpathSync: ((path: string | URL, options?: any) => string) & {
    native(path: string | URL, options?: any): string;
  };
  export function watch(filename: string | URL, options?: any, listener?: (eventType: string, filename: string | null) => void): { on(event: string, cb: (...args: any[]) => void): any; close(): void };
}
declare module 'node:fs/promises' {
  export function access(path: string | URL, mode?: number): Promise<void>;
  export function copyFile(src: string | URL, dest: string | URL, mode?: number): Promise<void>;
  export function lstat(path: string | URL): Promise<{ isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; size: number }>;
  export function mkdir(path: string | URL, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string | URL, encoding: 'utf8' | 'utf-8'): Promise<string>;
  export function readFile(path: string | URL): Promise<Buffer>;
  export function readdir(path: string | URL, options?: any): Promise<any[]>;
  export function rename(oldPath: string | URL, newPath: string | URL): Promise<void>;
  export function rm(path: string | URL, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  export function stat(path: string | URL): Promise<any>;
  export function writeFile(path: string | URL, data: string | Uint8Array, options?: any): Promise<void>;
}
declare module 'node:path' {
  export const sep: string;
  export function basename(path: string, suffix?: string): string;
  export function dirname(path: string): string;
  export function extname(path: string): string;
  export function join(...paths: string[]): string;
  export function relative(from: string, to: string): string;
  export function resolve(...paths: string[]): string;
  export function isAbsolute(path: string): boolean;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
  export function pathToFileURL(path: string): URL;
  export { URL, URLSearchParams };
}
declare module 'node:util' {
  export { TextDecoder, TextEncoder };
}
declare module 'node:timers' {
  export { setTimeout, clearTimeout, setInterval, clearInterval };
}
declare module 'node:zlib' {
  export function gzipSync(buf: string | Uint8Array): Buffer;
}
declare module 'node:dns/promises' {
  export function lookup(hostname: string, options?: any): Promise<any>;
  export class Resolver {
    constructor(options?: { timeout?: number; tries?: number });
    resolve4(hostname: string): Promise<string[]>;
    resolve6(hostname: string): Promise<string[]>;
    cancel(): void;
  }
}
declare module 'node:net' {
  export function isIP(input: string): number;
  export class BlockList {
    addAddress(address: string, type?: 'ipv4' | 'ipv6'): void;
    addRange(start: string, end: string, type?: 'ipv4' | 'ipv6'): void;
    addSubnet(net: string, prefix: number, type?: 'ipv4' | 'ipv6'): void;
    check(address: string, type?: 'ipv4' | 'ipv6'): boolean;
  }
}
declare module 'node:http' {
  export function createServer(requestListener?: (req: any, res: any) => void): any;
  export function request(url: string | URL, options: any, callback?: (res: any) => void): any;
}
declare module 'node:https' {
  export function request(url: string | URL, options: any, callback?: (res: any) => void): any;
}
declare module 'node:stream' {
  export class Readable {
    static toWeb(streamReadable: any): ReadableStream;
    static fromWeb(readableStream: any): any;
  }
}
declare module 'node:readline' {
  export function createInterface(options: any): AsyncIterable<string> & { on(event: string, cb: (...args: any[]) => void): any; close(): void };
}
declare module 'node:timers/promises' {
  export function setTimeout<T = void>(delay?: number, value?: T, options?: { signal?: AbortSignal }): Promise<T>;
}
declare module '@awesome.me/webawesome/dist/*' {}

declare module '*desktop-model-fetch.js' {
  export function createDesktopModelFetch(options: {
    invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>;
    createChannel: () => { onmessage: (event: unknown) => void };
  }): ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) & { dispose: () => void };
}

/** Owns browser resources for one routed page, including delayed PDF/QR work. */
export class PageScope {
  private readonly elements = new Map<string, HTMLElement>();
  private readonly urls = new Set<string>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly abort = new AbortController();
  disposed = false;

  constructor(private readonly host: HTMLElement) {
    for (const element of host.querySelectorAll<HTMLElement>('[id]')) this.elements.set(element.id, element);
  }

  get = (id: string): any => {
    const element = this.host.querySelector<HTMLElement>(`#${id}`);
    if (element) this.elements.set(id, element);
    return element || this.elements.get(id) || null;
  };
  queryAll = (selector: string): NodeListOf<HTMLElement> => this.host.querySelectorAll(selector);
  assertActive = (): void => { if (this.disposed) throw new Error('This certificate page has been closed.'); };
  listen = (target: EventTarget, type: string, callback: EventListener): void => {
    target.addEventListener(type, callback, { signal: this.abort.signal });
  };
  setTimeout = (callback: () => void, delay: number): void => {
    if (this.disposed) return;
    const timer = setTimeout(() => { this.timers.delete(timer); if (!this.disposed) callback(); }, delay);
    this.timers.add(timer);
  };
  createObjectURL = (blob: Blob): string => {
    this.assertActive();
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  };
  revokeObjectURL = (url: string): void => { URL.revokeObjectURL(url); this.urls.delete(url); };
  destroy(): void {
    this.disposed = true;
    this.abort.abort();
    for (const timer of this.timers) clearTimeout(timer);
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.timers.clear();
    this.urls.clear();
  }
}

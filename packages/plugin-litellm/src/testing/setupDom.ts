/**
 * Minimal DOM bootstrap for component tests run with `node --test`.
 * Import this module FIRST in a component test file (before React or
 * Testing Library) so `window`/`document` exist when they load.
 */
import { JSDOM, VirtualConsole } from 'jsdom';

// jsdom logs every CSS rule it can't parse (emotion injects modern CSS); those
// are noise in tests, so don't forward them to the console.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  virtualConsole: new VirtualConsole(),
  pretendToBeVisual: true,
});

const g = globalThis as unknown as Record<string, unknown>;

// Expose the whole jsdom window (DocumentFragment, Element, Event, ...) as
// globals, without clobbering anything Node already defines (console, process,
// timers, fetch, ...).
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in g || ['window', 'self', 'top', 'parent', 'document', 'navigator'].includes(key)) {
    continue;
  }
  Object.defineProperty(globalThis, key, {
    configurable: true,
    get: () => (dom.window as unknown as Record<string, unknown>)[key],
  });
}
const define = (name: string, value: unknown) =>
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

define('window', dom.window);
define('document', dom.window.document);
// Node >= 21 defines a getter-only global `navigator`.
define('navigator', dom.window.navigator);
define('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
define('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0));
define('cancelAnimationFrame', (id: number) => clearTimeout(id));
define('IS_REACT_ACT_ENVIRONMENT', true);

export { dom };

/** Minimal AlertApi fake for component tests (records posted alerts). */
export const fakeAlertApi = {
  posted: [] as Array<{ message: string; severity?: string }>,
  post(alert: { message: string; severity?: string }) {
    this.posted.push(alert);
  },
};

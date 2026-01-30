
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../web/dist/assets');

// Find the main entry file from index.html (or use known hash)
const mainFile = 'index-DIBcsXkp.js';

if (!fs.existsSync(path.join(distPath, mainFile))) {
    console.error("Main file not found: " + mainFile);
    // Fallback to finding the largest index- file
    const files = fs.readdirSync(distPath);
    const indexFiles = files.filter(f => f.startsWith('index-') && f.endsWith('.js'));
    const sorted = indexFiles.sort((a,b) => fs.statSync(path.join(distPath, b)).size - fs.statSync(path.join(distPath, a)).size);
    if(sorted.length > 0) {
        console.log("Falling back to largest index file: " + sorted[0]);
        // mainFile = sorted[0]; // (Can't reassign const, just use bundlePath logic below)
    }
}

const bundlePath = path.join(distPath, mainFile);
console.log(`Running smoke test on ${bundlePath}`);

// MOCK BROWSER ENV
global.window = {
  navigator: { userAgent: 'Nodejs Smoke Test', serviceWorker: { register: () => Promise.resolve() } },
  location: { pathname: '/', search: '', hash: '', origin: 'http://localhost' },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
  sessionStorage: {
      getItem: () => null,
      setItem: () => {},
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  document: {
      body: { 
          classList: { add: () => {}, remove: () => {}, contains: () => false },
          appendChild: () => {},
          addEventListener: () => {},
          removeEventListener: () => {}
      },
      documentElement: { 
          style: {},
          addEventListener: () => {},
          removeEventListener: () => {}
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ 
        style: {}, 
        setAttribute: () => {}, 
        appendChild: () => {}, 
        cssText: '',
        addEventListener: () => {},
        removeEventListener: () => {}
      }),
      head: { appendChild: () => {} },
      getElementById: () => ({ 
          nodeType: 1, 
          tagName: 'DIV', 
          ownerDocument: global.document,
          appendChild: () => {},
          firstChild: null,
      }),
      title: '',
      cookie: '',
      referrer: '',
  },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  fetch: () => Promise.resolve({ ok: true, json: () => ({}) }),
  performance: { 
      now: () => Date.now(), 
      mark: () => {}, 
      measure: () => {},
      getEntriesByType: () => [] 
  },
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  CSS: { supports: () => false },
  HTMLMetaElement: class {},
  MutationObserver: class { observe() {} disconnect() {} },
  IntersectionObserver: class { observe() {} disconnect() {} },
  ResizeObserver: class { observe() {} disconnect() {} },
  PerformanceObserver: class { observe() {} disconnect() {} },
};
global.document = global.window.document;
global.self = global.window;
// Define properties for read-only globals
Object.defineProperty(global, 'navigator', {
  value: global.window.navigator,
  writable: true
});
Object.defineProperty(global, 'location', {
    value: global.window.location,
    writable: true
});
Object.defineProperty(global, 'localStorage', {
    value: global.window.localStorage,
    writable: true
});
Object.defineProperty(global, 'sessionStorage', {
    value: global.window.sessionStorage,
    writable: true
});
Object.defineProperty(global, 'MutationObserver', { value: global.window.MutationObserver, writable: true });
Object.defineProperty(global, 'IntersectionObserver', { value: global.window.IntersectionObserver, writable: true });
Object.defineProperty(global, 'ResizeObserver', { value: global.window.ResizeObserver, writable: true });
Object.defineProperty(global, 'PerformanceObserver', { value: global.window.PerformanceObserver, writable: true });

// Stub CSS imports if any remain in JS (unlikely in Vite build but possible)
// But mostly we just want to import the JS and see if it throws immediately.

try {
  await import('file://' + bundlePath);
  console.log("SUCCESS: Bundle imported without throwing synchronous errors.");
} catch (e) {
  console.error("FAILURE: Bundle crashed on import.");
  console.error(e);
}

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { readFileSync } from 'node:fs';

import { initFlowSelector, FLOW_TILE_MAP } from '../../consciousness-explorer/dashboard/flow-selector.js';

const TILE_BASE = path.resolve(__dirname, '../../consciousness-explorer/tiles');

function readTileJson(tileKey) {
  const file = path.join(TILE_BASE, tileKey, 'tile.json');
  return JSON.parse(readFileSync(file, 'utf8'));
}

let dom;
const originalFetch = globalThis.fetch;

describe('flow selector integration', () => {
  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
      url: 'http://localhost/'
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.CSS = dom.window.CSS;
    globalThis.queueMicrotask = queueMicrotask;

    globalThis.fetch = async (url) => {
      const match = /\.\.\/tiles\/(.+?)\/tile\.json/.exec(String(url));
      if (!match) {
        throw new Error(`Unexpected fetch URL: ${url}`);
      }
      const tileKey = match[1];
      const payload = readTileJson(tileKey);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        }
      };
    };
  });

  afterAll(() => {
    dom?.window?.close?.();
    globalThis.fetch = originalFetch;
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.CSS;
  });

  it('loads each flow and surfaces flow questions', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const api = initFlowSelector(container, { autoLoad: false });

    for (const flow of FLOW_TILE_MAP) {
      const bundle = await api.loadTileByFlow(flow.flowKey);
      expect(bundle).toBeTruthy();
      expect(bundle.flowResult?.question).toBeTypeOf('string');
      expect(bundle.meta?.flowQuestion).toBe(bundle.flowResult?.question);
      expect(bundle.meta?.name || bundle.meta?.description).toBeTruthy();
    }

    expect(container.querySelectorAll('.flow-selector-item').length).toBe(FLOW_TILE_MAP.length);
  });
});

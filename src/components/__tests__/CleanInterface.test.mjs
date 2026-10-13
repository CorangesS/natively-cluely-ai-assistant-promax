import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const scratch = mkdtempSync(join(tmpdir(), 'clean-interface-'));
try {
  // Bundle the render helper too so hooks use the same React instance.
  const renderer = join(scratch, 'render.cjs');
  buildSync({ stdin: { contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { FreeTrialModal } from './src/components/trial/FreeTrialModal'; export function render(active) { return renderToStaticMarkup(React.createElement(FreeTrialModal, { usage: {}, onByok: async () => {}, activeTrialExpiresAt: active ? '2099-01-01' : undefined })); }`, resolveDir: root }, outfile: renderer, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic' });
  const { render } = require(renderer);
  test('expired and active trial notices contain status and API setup without sales', () => {
    for (const active of [false, true]) {
      const html = render(active);
      assert.match(html, /Use my own keys/);
      assert.match(html, /Close/);
      assert.doesNotMatch(html, /checkout|See plans|Upgrade|Buy|Max plan|Ultra plan|https?:/i);
    }
  });
} finally { rmSync(scratch, { recursive: true, force: true }); }

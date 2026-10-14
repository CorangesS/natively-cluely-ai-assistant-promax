import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const scratch = mkdtempSync(join(tmpdir(), 'promax-interface-'));
try {
  const renderer = join(scratch, 'render.cjs');
  buildSync({ stdin: { contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { HelpSettings } from './src/components/settings/HelpSettings'; import { AboutSection } from './src/components/AboutSection'; export { normalizeSettingsTab } from './src/lib/promaxFeatures'; export function render() { return renderToStaticMarkup(<><HelpSettings /><AboutSection /></>); }`, loader: 'tsx', resolveDir: root }, outfile: renderer, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', define: { 'import.meta.env': '{}' } });
  const { render, normalizeSettingsTab } = require(renderer);
  test('help and about explain API and LAN setup without purchases or private features', () => {
    const html = render();
    assert.match(html, /AI Providers/);
    assert.match(html, /截图并发送/);
    assert.doesNotMatch(html, /checkout|billing|license|upgrade|Profile Intelligence|free trial|https?:/i);
  });
  test('old account deep links land on usable provider settings', () => {
    for (const tab of ['plans', 'natively-api', 'natively-pro', 'profile', 'modes']) assert.equal(normalizeSettingsTab(tab), 'ai-providers');
    for (const tab of ['general', 'audio', 'phone-mirror']) assert.equal(normalizeSettingsTab(tab), tab);
  });
  test('launcher and overlay no longer mount account, profile, mode or trial screens', () => {
    const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
    const settings = readFileSync(join(root, 'src/components/SettingsOverlay.tsx'), 'utf8');
    const overlay = readFileSync(join(root, 'src/components/NativelyInterface.tsx'), 'utf8');
    assert.doesNotMatch(app, /<(FreeTrialModal|ProfileIntelligenceSettings|ModesSettings)\b/);
    assert.doesNotMatch(settings, /<PlansSettings\s/);
    assert.doesNotMatch(overlay, /<(TrialChip|TrialNoticeBanner)\b/);
  });
} finally { rmSync(scratch, { recursive: true, force: true }); }

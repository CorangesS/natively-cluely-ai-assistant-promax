import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { registerRemovedFeatureIpc } = require('../../../dist-electron/electron/services/removedFeatureIpc.js');

test('legacy clients cannot activate upstream features, start trials or delete stored profiles', async () => {
  const handlers = new Map();
  registerRemovedFeatureIpc((name, fn) => handlers.set(name, fn));
  const priorFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Unexpected upstream request'); };
  try {
    for (const name of ['license:activate', 'license:deactivate', 'trial:start', 'trial:end-byok', 'profile:delete', 'profile:upload-resume', 'roleInsight:analyse', 'modes:create']) {
      assert.equal(typeof handlers.get(name), 'function', name);
      const result = await handlers.get(name)({}, '/a/user/document', 'old-license');
      assert.equal(result.success, false, name);
      assert.equal(result.error, 'feature_removed', name);
    }
    assert.equal(await handlers.get('license:check-premium')(), false);
    assert.deepEqual(await handlers.get('modes:get-all')(), []);
    assert.equal(await handlers.get('modes:get-active')(), null);
    assert.equal((await handlers.get('trial:get-local')()).hasToken, false);
  } finally { globalThis.fetch = priorFetch; }
});

test('normal Electron output has no unresolved private repository imports or entitlement activation', () => {
  const root = resolve('dist-electron/electron');
  for (const file of readdirSync(root, { recursive: true }).filter(f => f.endsWith('.js'))) {
    const output = readFileSync(resolve(root, file), 'utf8');
    assert.doesNotMatch(output, /require\(["'][^"']*\.\.\/premium\//, file);
    assert.doesNotMatch(output, /require\(["'][^"']*proEntitlementWiring/, file);
  }
  const main = readFileSync(resolve(root, 'main.js'), 'utf8');
  assert.doesNotMatch(main, /wipeTrialProfileData|autoStartTrialForMeeting|settleExpiredTrial|activateWithApiKey/);
});

test('desktop checkout and installer wrapper do not require private access or calendar credentials', () => {
  assert.doesNotMatch(readFileSync('.gitmodules', 'utf8'), /premium/);
  assert.doesNotMatch(readFileSync('scripts/package-app.js', 'utf8'), /calendarSecretProblem|Refusing to package/);
  assert.doesNotMatch(readFileSync('.github/workflows/build-smoke.yml', 'utf8'), /SUBMODULE_TOKEN|GH_APP_TOKEN|typecheck:premium/);
});

test('marketing telemetry remains inert even when old callers invoke it', async () => {
  const { funnelTelemetry } = require('../../../dist-electron/electron/services/FunnelTelemetry.js');
  const priorFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Unexpected marketing request'); };
  try {
    funnelTelemetry.start();
    assert.equal(funnelTelemetry.isEnabled(), false);
    assert.equal(funnelTelemetry.track('trial_started'), 'disabled');
    assert.equal(funnelTelemetry.featureUsed('profile'), 'disabled');
    await funnelTelemetry.tick();
    assert.equal(funnelTelemetry.tagOutgoingUrl('https://example.com').url, 'https://example.com');
    funnelTelemetry.stop();
  } finally { globalThis.fetch = priorFetch; }
});

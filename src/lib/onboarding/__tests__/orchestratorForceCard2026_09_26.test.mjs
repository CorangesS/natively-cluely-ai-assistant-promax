// A forced card is still a card (toaster policy Phase 4, spec §10): the DEV
// overrides (?forceCard, ?forceAd, ?review=force, ?extToaster=force) go
// through the orchestrator, take the one card slot like any other card, and
// are marked forced so the host records no ledger outcome for them.
//
// Run: node --experimental-strip-types --test src/lib/onboarding/__tests__/orchestratorForceCard2026_09_26.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
let timerQueue = [];
let mockNow = 0;
function installPolyfills() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  globalThis.performance = { now: () => mockNow };
  let seq = 0;
  globalThis.setTimeout = (cb) => { const id = ++seq; timerQueue.push({ id, cb }); return id; };
  globalThis.clearTimeout = (id) => { timerQueue = timerQueue.filter((e) => e.id !== id); };
}
const flush = (n = 3) => { for (let i = 0; i < n; i++) { const p = timerQueue; timerQueue = []; for (const { cb } of p) cb(); } };

let OnboardingOrchestrator, STAGES, policy, forcedCardFromQuery;
before(async () => {
  installPolyfills();
  ({ OnboardingOrchestrator } = await import(pathToFileURL(join(__dirname, '..', 'orchestrator.ts')).href));
  ({ STAGES } = await import(pathToFileURL(join(__dirname, '..', 'stageCatalog.ts')).href));
  ({ forcedCardFromQuery } = await import(pathToFileURL(join(__dirname, '..', 'devOverrides.ts')).href));
  policy = await import(pathToFileURL(join(__dirname, '..', '..', 'cards', 'cardPolicy.mjs')).href);
});

function fresh(user = {}) {
  localStorage.clear(); timerQueue = []; mockNow = 0;
  const orch = new OnboardingOrchestrator();
  orch.start(STAGES);
  orch.emit({ type: 'launcher:mounted' });
  orch.emit({ type: 'foreground:change', isForeground: true });
  orch.setUserState({ permsShown: true, extensionSupported: true, hasNativelyKey: true, ...user });
  return orch;
}

test('forceCard takes the empty slot and marks the showing forced', () => {
  const orch = fresh();
  assert.equal(orch.forceCard('permissions'), true);
  const snap = orch.getSnapshot();
  assert.equal(snap.activeToasterId, 'permissions');
  assert.equal(snap.forcedToasterId, 'permissions');
});

test('forceCard never overlaps an open card', () => {
  const orch = fresh({ permsShown: false, permissionsNeedAttention: true, cardLedger: policy.emptyLedger(Date.now()) });
  mockNow += 10_000; flush();
  assert.equal(orch.getSnapshot().activeToasterId, 'permissions', 'precondition: a real card is open');
  assert.equal(orch.forceCard('permissions'), false);
  assert.equal(orch.getSnapshot().activeToasterId, 'permissions');
  assert.equal(orch.getSnapshot().forcedToasterId, null);
});

test('forceCard refuses a stage that does not exist', () => {
  assert.equal(fresh().forceCard('popup_of_doom'), false);
});

test('closing a forced card clears the mark', () => {
  const orch = fresh();
  orch.forceCard('permissions');
  orch.markDismissed('permissions');
  assert.equal(orch.getSnapshot().activeToasterId, null);
  assert.equal(orch.getSnapshot().forcedToasterId, null);
});

test('the drain never replaces a forced card', () => {
  const orch = fresh({ cardLedger: policy.emptyLedger(Date.now()) });
  orch.forceCard('permissions');
  mockNow += 120_000; flush();
  assert.equal(orch.getSnapshot().activeToasterId, 'permissions');
});

test('forcedCardFromQuery only permits essential permission UI', () => {
  assert.equal(forcedCardFromQuery('?forceCard=permissions'), 'permissions');
  for (const query of ['?forceCard=profile_ad', '?forceAd=natively_api', '?review=force', '?extToaster=force', '?forceCard=support']) {
    assert.equal(forcedCardFromQuery(query, { adsAvailable: true }), null);
  }
});

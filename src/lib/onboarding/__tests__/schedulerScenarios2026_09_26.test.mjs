// The spec's seven scheduler scenarios, across launches (toaster policy
// Phase 3, docs/superpowers/specs/2026-09-26-toaster-policy-design.md §11).
//
// Real OnboardingOrchestrator, the real STAGES + QUIET_WINDOW_STAGE catalog, a
// fake performance clock and timer queue, and localStorage that PERSISTS
// between simulated launches. The card ledger is handled the way the host and
// main do it: 'shown' when a card becomes active, the close's outcome, and
// launchCount + 1 per launch. Days pass by ageing every ledger timestamp
// (the class reads the real Date.now() for ledger decisions), which is the
// same as the clock moving forward.
//
// Run: node --experimental-strip-types --test src/lib/onboarding/__tests__/schedulerScenarios2026_09_26.test.mjs
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const H = 3_600_000;
const D = 24 * H;

let timerQueue = [];
let mockNow = 0;
const store = new Map();

function installPolyfills() {
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
function flush(times = 3) {
  for (let i = 0; i < times; i++) {
    const pending = timerQueue;
    timerQueue = [];
    for (const { cb } of pending) cb();
  }
}

let OnboardingOrchestrator, STAGES, QUIET_WINDOW_STAGE, policy;
before(async () => {
  installPolyfills();
  ({ OnboardingOrchestrator } = await import(pathToFileURL(join(__dirname, '..', 'orchestrator.ts')).href));
  ({ STAGES, QUIET_WINDOW_STAGE } = await import(pathToFileURL(join(__dirname, '..', 'stageCatalog.ts')).href));
  policy = await import(pathToFileURL(join(__dirname, '..', '..', 'cards', 'cardPolicy.mjs')).href);
});
beforeEach(() => { store.clear(); timerQueue = []; mockNow = 0; });

/** Move every ledger timestamp back by `ms`: the same as `ms` passing. */
function age(ledger, ms) {
  const back = (t) => (typeof t === 'number' ? t - ms : t);
  const cards = {};
  for (const [id, e] of Object.entries(ledger.cards)) {
    cards[id] = { ...e, nextEligibleAt: back(e.nextEligibleAt), lastShownAt: back(e.lastShownAt), retiredUntil: back(e.retiredUntil) };
  }
  return { ...ledger, firstLaunchAt: back(ledger.firstLaunchAt), lastPromoShownAt: back(ledger.lastPromoShownAt), cards };
}

/**
 * One app launch. `user` is the launcher's user state; the returned session
 * keeps the ledger in step the way the host (shown, outcome) and main
 * (launch count) do.
 */
function launch(ledger, user = {}) {
  timerQueue = [];
  mockNow = 0;
  const s = { ledger: { ...ledger, launchCount: ledger.launchCount + 1 }, seen: [] };
  const orch = new OnboardingOrchestrator();
  s.orch = orch;
  orch.start([...STAGES, QUIET_WINDOW_STAGE]);
  orch.emit({ type: 'launcher:mounted' });
  orch.emit({ type: 'foreground:change', isForeground: true });
  orch.setUserState({ extensionSupported: true, adsAvailable: true, permsShown: true, ...user, cardLedger: s.ledger });
  s.active = () => orch.getSnapshot().activeToasterId;
  /** Advance home-screen time, recording each card that becomes active. */
  s.run = (ms) => {
    for (let t = 0; t < ms; t += 1_000) {
      mockNow += 1_000;
      flush();
      const a = s.active();
      if (a && s.seen.at(-1) !== a) {
        s.seen.push(a);
        if (policy.CARDS[a]) { s.ledger = policy.applyOutcome(s.ledger, a, 'shown', Date.now()); orch.setUserState({ cardLedger: s.ledger }); }
      }
    }
    return s;
  };
  /** Close the active card the way the host does. */
  s.close = (outcome = 'later', meta) => {
    const a = s.active();
    assert.ok(a, 'a card is open to close');
    if (policy.CARDS[a] && outcome) { s.ledger = policy.applyOutcome(s.ledger, a, outcome, Date.now(), meta); orch.setUserState({ cardLedger: s.ledger }); }
    orch.markDismissed(a);
    return s;
  };
  s.end = () => { orch.stop(); return s; };
  return s;
}

for (const [name, user] of [
  ['new user', { hasNativelyKey: false, hasOwnAiKey: false, isPremium: false }],
  ['own API keys', { hasOwnAiKey: true }],
  ['used trial', { trialClaimed: true }],
  ['Pro near quota', { isPremium: true, planTier: 'pro', nativelyQuotaPct: 95 }],
]) {
  test(`${name}: no promotion on launch or after several days`, () => {
    for (const days of [0, 4, 30]) {
      const s = launch(age(policy.emptyLedger(Date.now()), days * D), user).run(120000);
      assert.deepEqual(s.seen, []);
      s.end();
    }
  });
}

test('permissions still appear when they need attention', () => {
  const s = launch(policy.emptyLedger(Date.now()), { permsShown: false, permissionsNeedAttention: true }).run(10000);
  assert.deepEqual(s.seen, ['permissions']);
  s.end();
});

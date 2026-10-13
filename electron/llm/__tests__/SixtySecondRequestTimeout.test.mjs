import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const live = require('../../../dist-electron/electron/llm/liveDeadlines.js');
const perf = require('../../../dist-electron/electron/llm/performance/deadlines.js');
const { DEFAULT_TEXT_FALLBACK_CONFIG: config } = require('../../../dist-electron/electron/llm/textStreamFallback.js');
const { runStreamingFallback } = require('../../../dist-electron/electron/llm/streamFallbackEngine.js');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

for (const isSpeculative of [false, true]) {
  test(`a superseded request drops its late token (speculative=${isSpeculative})`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let currentId = 1;
    const tokens = [], cleanups = [];
    const oldStream = (async function* () { await delay(59000); yield 'old answer'; })();
    const oldResult = live.raceStreamWithDeadline({
      stream: oldStream, firstUsefulDeadlineMs: 60000, isSpeculative,
      shouldAbort: () => currentId !== 1,
      onToken: token => tokens.push(token), isUsefulYet: () => false,
      onCleanup: reason => cleanups.push(reason),
    });
    t.mock.timers.tick(13000); await flush();
    currentId = 2;
    const newResult = await live.raceStreamWithDeadline({
      stream: (async function* () { yield 'new answer'; })(), firstUsefulDeadlineMs: 60000,
      onToken: token => tokens.push(token), isUsefulYet: () => true,
    });
    assert.equal(newResult, 'done');
    t.mock.timers.tick(46000); await flush();
    assert.equal(await oldResult, 'aborted');
    assert.deepEqual(tokens, ['new answer']);
    assert.deepEqual(cleanups, ['aborted']);
  });
}

test('a superseded pending request cannot report a timeout for the new request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let superseded = false, timeoutReported = false;
  const result = live.raceStreamWithDeadline({
    stream: (async function* () { await new Promise(() => {}); })(),
    firstUsefulDeadlineMs: 60000, shouldAbort: () => superseded,
    onToken() {}, isUsefulYet: () => false,
    onFirstUsefulTimeout: () => { timeoutReported = true; },
  });
  t.mock.timers.tick(13000); await flush(); superseded = true;
  t.mock.timers.tick(47000); await flush();
  assert.equal(await result, 'aborted');
  assert.equal(timeoutReported, false);
});

test('all live routes and learned profiles keep a full 60 second wait', () => {
  for (const route of [{}, { isLocal: true }, { isVisionTurn: true }, { viaServerCascade: true }, { isUserEndpoint: true }]) {
    for (const latency of [null, { count: 50, maxMs: 100 }, { count: 50, maxMs: 120000 }]) {
      assert.equal(live.totalHardTimeoutMs({ ...route, observedUserEndpointLatency: latency }), 60000);
      assert.equal(live.firstUsefulDeadlineMs('general_meeting_answer', route.isLocal, route.viaServerCascade, route.isUserEndpoint, latency), 60000);
      assert.equal(live.repairDeadlineMs({ ...route, observedUserEndpointLatency: latency }), 60000);
    }
  }
  const profile = { stream: { count: 50, maxGapMs: 100 }, connect: { count: 50, maxMs: 100 } };
  for (const route of ['local', 'vision', 'server_cascade', 'user_endpoint', 'default_provider']) {
    assert.equal(perf.streamIdleTimeoutMs(route, profile).valueMs, 0);
  }
  assert.equal(perf.connectTimeoutMs(profile).valueMs, 60000);
});

for (const firstDelay of [20000, 59000]) {
  test(`first useful content after ${firstDelay / 1000}s is delivered`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let text = '';
    const stream = (async function* () { await delay(firstDelay); yield 'A valid delayed answer'; })();
    const result = live.raceStreamWithDeadline({ stream, firstUsefulDeadlineMs: 60000, onToken: token => { text += token; }, isUsefulYet: () => !!text });
    t.mock.timers.tick(13000); await flush();
    assert.equal(text, '');
    t.mock.timers.tick(firstDelay - 13000); await flush();
    assert.equal(await result, 'done');
    assert.equal(text, 'A valid delayed answer');
  });
}

test('no first token times out at 60 seconds, never at 8 or 13', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let outcome;
  const stream = (async function* () { await new Promise(() => {}); })();
  const result = live.raceStreamWithDeadline({ stream, firstUsefulDeadlineMs: 60000, onToken() {}, isUsefulYet: () => false }).then(value => { outcome = value; });
  t.mock.timers.tick(59999); await flush(); assert.equal(outcome, undefined);
  t.mock.timers.tick(1); await result; assert.equal(outcome, 'first_useful_timeout');
});

test('30 second mid-stream pause and an answer lasting over a minute complete', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let text = '';
  const stream = (async function* () { yield 'start '; await delay(30000); yield 'middle '; await delay(40000); yield 'end'; })();
  const result = live.raceStreamWithDeadline({ stream, firstUsefulDeadlineMs: 60000, onToken: token => { text += token; }, isUsefulYet: () => !!text });
  await flush(); t.mock.timers.tick(30000); await flush(); t.mock.timers.tick(40000); await flush();
  assert.equal(await result, 'done'); assert.equal(text, 'start middle end');
});

test('an explicitly requested stall guard can still protect background/test consumers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let text = '', outcome;
  const stream = (async function* () { yield 'partial'; await new Promise(() => {}); })();
  const result = live.raceStreamWithDeadline({ stream, firstUsefulDeadlineMs: 60000, interTokenStallMs: 60000, onToken: token => { text += token; }, isUsefulYet: () => !!text }).then(value => { outcome = value; });
  await flush(); t.mock.timers.tick(59999); await flush(); assert.equal(outcome, undefined);
  t.mock.timers.tick(1); await result; assert.equal(outcome, 'stall_timeout'); assert.equal(text, 'partial');
});

test('inner provider override cannot abort at 2.5 seconds before outer 60 second wait', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let signal, output = '';
  const providers = [{ id: 'slow', name: 'Slow', priority: 0, isLocal: false, ttftTimeoutMs: 2500,
    open: async function* (s) { signal = s; await delay(20000); yield 'delayed content'; } }];
  const result = (async () => {
    for await (const token of runStreamingFallback(providers, { ...config, maxAttempts: 1 }, new Map(), {}, undefined)) output += token;
  })();
  await flush(); t.mock.timers.tick(13000); await flush(); assert.equal(signal.aborted, false);
  t.mock.timers.tick(7000); await flush(); await result; assert.equal(output, 'delayed content');
});

for (const useFallbackEngine of [false, true]) {
  test(`response reception survives a five-minute pause (fallback=${useFallbackEngine})`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    let text = '', ended = false;
    const slow = async function* () { yield 'A'; await delay(300000); yield ' complete answer'; };
    const stream = useFallbackEngine
      ? runStreamingFallback([{ id: 'slow', name: 'Slow', priority: 0, isLocal: false, open: slow }], { ...config, maxAttempts: 1 }, new Map(), {}, undefined)
      : slow();
    const result = live.raceStreamWithDeadline({ stream, firstUsefulDeadlineMs: 60000, onToken: value => { text += value; }, isUsefulYet: () => false }).then(value => { ended = true; return value; });
    await flush(); t.mock.timers.tick(299999); await flush();
    assert.equal(ended, false); assert.equal(text, 'A');
    t.mock.timers.tick(1); await flush(); assert.equal(await result, 'done');
    assert.equal(text, 'A complete answer');
  });
}

test('cancellation interrupts a pending post-response read without an idle deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  let cancelled = false;
  const result = live.raceStreamWithDeadline({
    stream: (async function* () { yield 'first'; await new Promise(() => {}); })(),
    firstUsefulDeadlineMs: 60000, onToken() {}, isUsefulYet: () => true,
    shouldAbort: () => cancelled,
  });
  await flush(); cancelled = true; t.mock.timers.tick(100); await flush();
  assert.equal(await result, 'aborted');
});

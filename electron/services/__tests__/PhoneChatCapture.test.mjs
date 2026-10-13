import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { preparePhoneChatImages } = require('../../../dist-electron/electron/services/phoneChatCapture.js');

test('one-click chat waits for capture and uses that screenshot, not a changing tray', async () => {
  let finishCapture, dispatched = false;
  const tray = ['old.png'];
  const operation = preparePhoneChatImages({
    captureScreen: true, attachedPaths: tray, isCurrent: () => true,
    capture: () => new Promise(resolve => { finishCapture = resolve; }),
  }).then(paths => { dispatched = true; return paths; });
  tray.push('unrelated.png');
  await Promise.resolve(); assert.equal(dispatched, false);
  finishCapture('current-screen.png');
  assert.deepEqual(await operation, ['current-screen.png']);
});

test('failed capture never dispatches a question without its screenshot', async () => {
  let dispatched = false;
  await assert.rejects(preparePhoneChatImages({
    captureScreen: true, attachedPaths: [], isCurrent: () => true,
    capture: async () => { throw new Error('permission denied'); },
  }).then(() => { dispatched = true; }), /permission denied/);
  assert.equal(dispatched, false);
});

test('cancellation during capture prevents stale image dispatch', async () => {
  let current = true, finishCapture;
  const operation = preparePhoneChatImages({
    captureScreen: true, attachedPaths: [], isCurrent: () => current,
    capture: () => new Promise(resolve => { finishCapture = resolve; }),
  });
  current = false; finishCapture('old-screen.png');
  assert.equal(await operation, null);
});

test('normal chat retains its attachments without taking another screenshot', async () => {
  assert.deepEqual(await preparePhoneChatImages({
    captureScreen: false, attachedPaths: ['a.png', 'a.png'], isCurrent: () => true,
    capture: async () => { throw new Error('unexpected capture'); },
  }), ['a.png']);
});

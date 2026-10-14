// Real loopback HTTP/WebSocket tests. Electron storage is isolated in a temporary directory.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import Module from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../');
const require = createRequire(path.join(repoRoot, 'package.json'));
const WS = require('ws').WebSocket;
const http = require('node:http');
const serviceBundle = process.env.PHONE_MIRROR_SERVICE_BUNDLE
  ? path.resolve(process.env.PHONE_MIRROR_SERVICE_BUNDLE)
  : path.resolve(repoRoot, 'dist-electron/electron/services/PhoneMirrorService.js');

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'natively-pm-refused-'));
const electronStub = {
  app: { isReady: () => true, getPath: () => userDataDir, whenReady: () => Promise.resolve(), on: () => {} },
  BrowserWindow: class {
    static getFocusedWindow() { return null; }
    static getAllWindows() { return []; }
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from('enc:' + s, 'utf8'),
    decryptString: (buf) => Buffer.from(buf).toString('utf8').replace(/^enc:/, ''),
  },
};
const originalLoad = Module._load;
const originalListen = http.Server.prototype.listen;
let svc;
let port = 0;
let token = null;

before(async () => {
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electronStub;
    return originalLoad.call(this, request, parent, isMain);
  };
  http.Server.prototype.listen = function (...args) {
    if (typeof args[0] === 'number' && args[0] >= 4123 && args[0] < 4135) {
      process.nextTick(() => this.emit('error', Object.assign(new Error('taken (test)'), { code: 'EADDRINUSE' })));
      return this;
    }
    return originalListen.apply(this, args);
  };
  svc = (await import(pathToFileURL(serviceBundle).href)).PhoneMirrorService.getInstance();
});

after(async () => {
  if (svc?.isRunning()) await svc.stop({ persist: false });
  Module._load = originalLoad;
  http.Server.prototype.listen = originalListen;
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  if (svc.isRunning()) await svc.stop({ persist: false });
  svc.history = [];
  svc.livePartial = null;
  const info = await svc.start({ exposeOnLan: false, persist: false });
  port = info.port;
  token = info.token;
  assert.ok(port < 4123 || port >= 4135);
});

const page = (q, method = 'GET') => fetch(`http://127.0.0.1:${port}/${q}`, { method, cache: 'no-store' });

describe('anonymous LAN control', () => {
  test('plain URL serves the page without an authentication screen', async () => {
    const response = await page('');
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.doesNotMatch(body, /data-link="refused"/);
    assert.match(body, /id="captureSendBtn"/);
    assert.doesNotMatch(body, /if \(!token\)/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  });
  test('advertised addresses contain no credential and HEAD succeeds', async () => {
    const info = await svc.snapshot();
    assert.equal(info.loopbackUrl, `http://127.0.0.1:${port}/`);
    assert.equal(info.token, null);
    assert.equal((await page('', 'HEAD')).status, 200);
  });
  test('stale legacy query parameters do not require pairing', async () => {
    assert.equal((await page('?t=old-link')).status, 200);
  });
  test('anonymous WebSocket sends a one-click capture question and cancel', async () => {
    const commands = [];
    const remove = svc.onPhoneCommand(command => commands.push(command));
    const ws = new WS(`ws://127.0.0.1:${port}/ws`, { handshakeTimeout: 3000 });
    try {
      await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); ws.once('unexpected-response', (req, res) => { req.destroy(); reject(new Error('HTTP ' + res.statusCode)); }); });
      ws.send(JSON.stringify({ type: 'chat', message: 'Explain my screen', captureScreen: true }));
      ws.send(JSON.stringify({ type: 'cancel' }));
      const until = Date.now() + 2000;
      while (commands.length < 2 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
      assert.deepEqual(commands, [{ type: 'chat', message: 'Explain my screen', captureScreen: true }, { type: 'cancel' }]);
    } finally { ws.close(); remove(); }
  });
  test('a website on another origin cannot open the command socket', async () => {
    const ws = new WS(`ws://127.0.0.1:${port}/ws`, { origin: 'https://unrelated.example' });
    const status = await new Promise((resolve, reject) => {
      ws.once('open', () => { ws.close(); reject(new Error('cross-origin control accepted')); });
      ws.once('unexpected-response', (req, res) => { res.resume(); req.destroy(); resolve(res.statusCode); });
      ws.on('error', () => {});
    });
    assert.equal(status, 403);
  });
  test('an anonymous phone cannot claim the browser extension role', async () => {
    const ws = new WS(`ws://127.0.0.1:${port}/ws`, { handshakeTimeout: 3000 });
    try {
      await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); ws.once('unexpected-response', (req, res) => { req.destroy(); reject(new Error('HTTP ' + res.statusCode)); }); });
      ws.send(JSON.stringify({ type: 'hello', role: 'extension' }));
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(svc.hasExtensionClient(), false);
      const response = await fetch(`http://127.0.0.1:${port}/dom`, { method: 'POST', body: '{}' });
      assert.equal(response.status, 401);
    } finally { ws.close(); }
  });
});

test('browser opens a plain URL and sends screenshot questions in one click', {
  skip: process.env.PHONE_MIRROR_BROWSER_TEST !== '1', timeout: 30000,
}, async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ channel: process.env.PHONE_BROWSER_CHANNEL || undefined, headless: true });
  const commands = [], errors = [];
  const remove = svc.onPhoneCommand(command => {
    commands.push(command);
    if (command.type === 'chat') {
      const id = String(commands.length);
      svc.publishUserMessage(id, command.message);
      svc.publishToken(id, 'Screen answer');
      // Leave the stream active so stop/clear can be exercised.
    }
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => document.getElementById('app').dataset.conn === 'live');
    assert.equal(await page.locator('#lock').isVisible(), false);
    await page.locator('#input').fill('解释屏幕上的问题');
    await page.locator('#captureSendBtn').click();
    await page.waitForFunction(() => document.getElementById('feedInner').textContent.includes('Screen answer'));
    assert.deepEqual(commands[0], { type: 'chat', message: '请根据当前电脑屏幕截图分析并回答其中的问题。\n\n本次补充要求：\n解释屏幕上的问题', captureScreen: true });
    await page.locator('#captureSendBtn').click();
    await page.waitForFunction(() => document.getElementById('feedInner').textContent.includes('请根据当前电脑屏幕截图分析并回答其中的问题。'));
    assert.equal(commands[1].captureScreen, true);
    await page.locator('#stopPhoneBtn').click();
    const until = Date.now() + 2000;
    while (commands.length < 3 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(commands[2].type, 'cancel');
    svc.publishDone('2', 'Screen answer');
    await page.waitForFunction(() => document.getElementById('stopPhoneBtn').disabled);

    // T0 controls are visible, large and side-by-side on phone and desktop.
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(400);
      const capture = await page.locator('#captureSendBtn').boundingBox();
      const clear = await page.locator('#clearScreenBtn').boundingBox();
      assert.ok(capture.height >= 48 && clear.height >= 48);
      assert.ok(Math.abs(capture.y - clear.y) < 1 && capture.x + capture.width <= clear.x);
      assert.ok(clear.x + clear.width <= viewport.width + 1 && clear.y + clear.height <= viewport.height + 1, JSON.stringify({viewport, capture, clear}));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('[data-menu="clear"]').count(), 0);
    await page.locator('#moreActions summary').click();
    assert.ok(await page.locator('[data-action="codeHint"]').isVisible());
    await page.locator('#moreActions summary').click();

    await page.locator('#editScreenshotPrompt').click();
    await page.locator('#screenshotPromptInput').fill('分析屏幕，先给结论，再给代码。');
    await page.locator('#saveScreenshotPrompt').click();
    await page.waitForFunction(() => document.getElementById('promptSaveStatus').textContent === '已保存到电脑软件');
    assert.equal(JSON.parse(fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf8')).phoneMirrorScreenshotPrompt, '分析屏幕，先给结论，再给代码。');
    await page.locator('#closeScreenshotPrompt').click();

    // A separate browser context reads the desktop value without browser storage.
    const otherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const other = await otherContext.newPage();
    await other.goto(`http://127.0.0.1:${port}/`);
    await other.waitForFunction(() => !document.getElementById('captureSendBtn').disabled);
    await other.locator('#editScreenshotPrompt').click();
    assert.equal(await other.locator('#screenshotPromptInput').inputValue(), '分析屏幕，先给结论，再给代码。');
    await other.locator('#screenshotPromptInput').fill('新设备保存的提示词');
    await other.locator('#saveScreenshotPrompt').click();
    await other.waitForFunction(() => document.getElementById('promptSaveStatus').textContent === '已保存到电脑软件');
    await page.locator('#editScreenshotPrompt').click();
    await page.waitForFunction(() => document.getElementById('screenshotPromptInput').value === '新设备保存的提示词');

    // A rejected disk write must not report success or replace the last saved value.
    const settings = globalThis.__nativelySettingsManagerV1__;
    const save = settings.saveSettings;
    settings.saveSettings = () => false;
    try {
      await page.locator('#screenshotPromptInput').fill('不能保存的值');
      await page.locator('#saveScreenshotPrompt').click();
      await page.waitForFunction(() => document.getElementById('promptSaveStatus').textContent.includes('保存失败'));
      assert.equal(settings.get('phoneMirrorScreenshotPrompt'), '新设备保存的提示词');
    } finally { settings.saveSettings = save; }
    await page.locator('#closeScreenshotPrompt').click();
    await page.locator('#input').fill('使用 Python');
    await page.locator('#captureSendBtn').click();
    await page.waitForFunction(() => document.querySelectorAll('.row-user.is-sending').length === 0);
    assert.equal(commands.at(-1).message, '新设备保存的提示词\n\n本次补充要求：\n使用 Python');
    const fixedRequest = commands.at(-1).message;
    await other.locator('#screenshotPromptInput').fill('下一次使用的提示词');
    await other.locator('#saveScreenshotPrompt').click();
    await other.waitForFunction(() => document.getElementById('promptSaveStatus').textContent === '已保存到电脑软件');
    assert.equal(commands.at(-1).message, fixedRequest);

    const commandCount = commands.length;
    await page.locator('#clearScreenBtn').click();
    assert.equal(await page.locator('.row-user').count(), 0);
    assert.ok(await page.locator('.answer.is-streaming').count() || await page.locator('.is-streaming').count());
    assert.equal(commands.length, commandCount, 'clear is local, never sends cancel/delete');
    await page.locator('#input').fill('普通问题');
    await page.locator('#sendBtn').click();
    await page.waitForFunction(() => document.querySelectorAll('.row-user.is-sending').length === 0);
    assert.deepEqual(commands.at(-1), { type: 'chat', message: '普通问题' });

    // Reload the desktop settings object from disk, as on app startup.
    globalThis.__nativelySettingsManagerV1__ = new settings.constructor();
    await other.reload();
    await other.waitForFunction(() => !document.getElementById('captureSendBtn').disabled);
    await other.locator('#editScreenshotPrompt').click();
    assert.equal(await other.locator('#screenshotPromptInput').inputValue(), '下一次使用的提示词');
    await other.locator('#resetScreenshotPrompt').click();
    await other.locator('#saveScreenshotPrompt').click();
    await other.waitForFunction(() => document.getElementById('promptSaveStatus').textContent === '已保存到电脑软件');
    assert.equal(JSON.parse(fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf8')).phoneMirrorScreenshotPrompt, '请根据当前电脑屏幕截图分析并回答其中的问题。');
    await otherContext.close();
    await page.screenshot({ path: path.join(os.tmpdir(), 'natively-lan-ui.png'), fullPage: true });
    await context.setOffline(true);
    for (const client of svc.wss.clients) client.terminate();
    await page.waitForFunction(() => document.getElementById('captureSendBtn').disabled);
    assert.equal(await page.locator('#clearScreenBtn').isEnabled(), true);
    await page.locator('#editScreenshotPrompt').click();
    assert.equal(await page.locator('#saveScreenshotPrompt').isDisabled(), true);
    await page.locator('#closeScreenshotPrompt').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);

    await context.close();
  } finally { remove(); await browser.close(); }
});

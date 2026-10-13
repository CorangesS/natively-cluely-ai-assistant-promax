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
      svc.publishDone(id, 'Screen answer');
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
    assert.deepEqual(commands[0], { type: 'chat', message: '解释屏幕上的问题', captureScreen: true });
    await page.locator('#captureSendBtn').click();
    await page.waitForFunction(() => document.getElementById('feedInner').textContent.includes('请根据当前电脑屏幕截图分析并回答其中的问题。'));
    assert.equal(commands[1].captureScreen, true);
    await page.locator('#stopPhoneBtn').click();
    const until = Date.now() + 2000;
    while (commands.length < 3 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(commands[2].type, 'cancel');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(os.tmpdir(), 'natively-lan-ui.png'), fullPage: true });
    await context.close();
  } finally { remove(); await browser.close(); }
});

// phone-mirror:enable used to bind 0.0.0.0 without the "Allow LAN access?"
// consent the LAN switch requires (setExposeOnLan). Both now share one rule:
// a LAN bind needs consent once per app run. A saved phoneMirrorExposeOnLan is
// not consent, because _start() persists whatever it was handed.
//
// Same harness as PhoneMirrorBrowserContextV2: electron stubbed via
// Module._load, the compiled service loaded from dist-electron. Nothing here
// starts a server on the LAN.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Module from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const compiledServicePath = path.resolve(repoRoot, 'dist-electron/electron/services/PhoneMirrorService.js');

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'natively-lan-consent-test-'));
const electronStub = {
  app: { isReady: () => true, getPath: () => userDataDir, whenReady: () => Promise.resolve(), on: () => {} },
  BrowserWindow: class { static getAllWindows() { return []; } static getFocusedWindow() { return null; } },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from('enc:' + s, 'utf8'),
    decryptString: (buf) => Buffer.from(buf).toString('utf8').replace(/^enc:/, ''),
  },
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronStub;
  return originalLoad.call(this, request, parent, isMain);
};

let svc;
before(async () => {
  const mod = await import(pathToFileURL(compiledServicePath).href);
  svc = mod.PhoneMirrorService.getInstance();
});
after(async () => {
  try { if (svc?.isRunning()) await svc.stop({ persist: false }); } catch {}
  Module._load = originalLoad;
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
});

test('LAN can start without a pairing or consent step in this fork', () => {
  assert.equal(svc.needsLanBindConfirmation(false), false);
  assert.equal(svc.needsLanBindConfirmation(true), false);
});

test('fresh settings enable the service and LAN, explicit off remains respected', async () => {
  const settingsFile = path.resolve(path.dirname(compiledServicePath), 'SettingsManager.js');
  const { SettingsManager } = await import(pathToFileURL(settingsFile).href);
  const settings = SettingsManager.getInstance();
  assert.equal(settings.get('phoneMirrorEnabled'), true);
  assert.equal(settings.get('phoneMirrorExposeOnLan'), true);
  settings.set('phoneMirrorEnabled', false);
  settings.set('phoneMirrorExposeOnLan', false);
  assert.equal(settings.get('phoneMirrorEnabled'), false);
  assert.equal(settings.get('phoneMirrorExposeOnLan'), false);
});

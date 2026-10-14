import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const workflow = fs.readFileSync('.github/workflows/build-smoke.yml', 'utf8');
const buildScript = fs.readFileSync('scripts/build-electron.js', 'utf8');
test('forks and main run the same standalone build without private credentials', () => {
  assert.doesNotMatch(workflow, /pull_request_target|SUBMODULE_TOKEN|GH_APP_TOKEN|submodule update|smoke_scope/);
  for (const script of ['typecheck:electron', 'build', 'build:electron', 'test:promax']) assert.ok(workflow.includes(`npm run ${script}`));
  assert.match(workflow, /macos-latest, windows-latest/);
});
test('normal build never externalizes unresolved private imports', () => {
  assert.doesNotMatch(buildScript, /CORE_SMOKE|coreSmokePremiumExternalPlugin|premiumDir/);
});

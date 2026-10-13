import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, STAGE_ORDER } from '../stageCatalog.ts';

test('clean interface schedules only permissions and invisible feature gates', () => {
  assert.deepEqual(STAGE_ORDER, ['permissions', 'profile_intelligence', 'modes_manager']);
  assert.deepEqual(STAGES.map(stage => stage.id), STAGE_ORDER);
  assert.deepEqual(STAGES.filter(stage => !stage.isGateOnly).map(stage => stage.id), ['permissions']);
});

test('broken permissions can still request attention after initial setup', () => {
  const permissions = STAGES.find(stage => stage.id === 'permissions');
  assert.equal(permissions.skipWhen({ permsShown: true, permissionsNeedAttention: false }), true);
  assert.equal(permissions.skipWhen({ permsShown: true, permissionsNeedAttention: true }), false);
  assert.equal(permissions.reEligibility({ permissionsNeedAttention: true }), true);
});

test('feature gates do not wait for a removed promotional stage', () => {
  for (const stage of STAGES) {
    for (const dependency of stage.requiresStages ?? []) assert.ok(STAGE_ORDER.includes(dependency));
  }
});

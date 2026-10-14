/** Legacy IPC compatibility only. No activation, network, or user-data deletion. */
export function registerRemovedFeatureIpc(register: (channel: string, handler: (...args: any[]) => any) => void): void {
  const removed = [
  "license:activate",
  "license:check-premium",
  "license:get-details",
  "license:check-premium-async",
  "license:deactivate",
  "license:get-hardware-id",
  "get-natively-plans",
  "profile:upload-resume",
  "profile:get-status",
  "profile:set-mode",
  "profile:delete",
  "profile:get-profile",
  "profile:get-company-dossier",
  "profile:select-file",
  "profile:upload-jd",
  "profile:delete-jd",
  "knowledge:export-profile-pack",
  "knowledge:list-profile-packs",
  "knowledge:get-profile-pack",
  "profile:research-company",
  "profile:generate-negotiation",
  "profile:generate-cover-letter",
  "profile:get-negotiation-state",
  "profile:reset-negotiation",
  "roleInsight:get-status",
  "roleInsight:get-report",
  "roleInsight:list-history",
  "roleInsight:analyse",
  "roleInsight:cancel",
  "roleInsight:apply-correction",
  "roleInsight:answer-clarification",
  "roleInsight:save-to-profile",
  "roleInsight:paste-jd",
  "roleInsight:import-jd-url",
  "modes:get-all",
  "modes:get-active",
  "modes:create",
  "modes:generate-from-brief",
  "modes:update",
  "modes:get-source-contract",
  "modes:build-user-source-contract",
  "modes:delete",
  "modes:set-active",
  "modes:get-reference-file-status",
  "modes:get-reference-files",
  "modes:upload-reference-file",
  "modes:delete-reference-file",
  "knowledge:list-packs",
  "knowledge:get-pack",
  "knowledge:regenerate-pack",
  "knowledge:export-pack",
  "knowledge:edit-card",
  "knowledge:approve-card",
  "knowledge:reject-card",
  "knowledge:restore-card-version",
  "knowledge:get-card-history",
  "modes:get-note-sections",
  "modes:add-note-section",
  "modes:update-note-section",
  "modes:delete-note-section",
  "modes:remove-all-note-sections",
  "__e2e__:ingest-profile-doc",
  "__e2e__:clear-profile",
  "__e2e__:enable-pro"
];
  for (const channel of removed) register(channel, () => ({ success: false, error: 'feature_removed' }));
  register('license:check-premium', () => false);
  register('license:check-premium-async', () => false);
  register('license:get-details', () => ({ isPremium: false }));
  register('profile:get-status', () => ({ hasProfile: false, hasJD: false, knowledgeMode: false }));
  register('modes:get-all', () => []);
  register('modes:get-active', () => null);
  register('trial:get-local', () => ({ hasToken: false, expired: false, showEndedCard: false }));
  register('trial:status', () => ({ ok: false, error: 'feature_removed' }));
  for (const channel of ['trial:start', 'trial:convert', 'trial:end-byok']) {
    register(channel, () => ({ success: false, ok: false, error: 'feature_removed' }));
  }
}

/** Retire saved links to removed account screens without leaving a blank panel. */
export function normalizeSettingsTab(tab: string): string {
  return ['plans', 'natively-api', 'natively-pro', 'profile', 'modes'].includes(tab) ? 'ai-providers' : tab;
}

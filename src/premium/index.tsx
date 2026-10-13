/**
 * Premium Module Loader
 *
 * Uses Vite's import.meta.glob to optionally load premium components
 * from the premium/ directory. If the premium/ folder is removed
 * (source-available build), the globs return empty objects and no-op
 * fallbacks are used instead. No build errors.
 */
import React from 'react';

// ─── No-op fallbacks ────────────────────────────────────────────────
const NullComponent: React.FC<any> = () => null;

// ─── Glob-import premium modules (empty {} when premium/ is absent) ──
const _profileVis = import.meta.glob<any>(
  '../../premium/src/ProfileVisualizer.tsx',
  { eager: true }
);
const _negotiationCard = import.meta.glob<any>(
  '../../premium/src/NegotiationCoachingCard.tsx',
  { eager: true }
);

/** Promotional components are excluded even when the private module is present. */
export const PREMIUM_ADS_AVAILABLE = false;
const _modesSettings = import.meta.glob<any>(
  '../../premium/src/ModesSettings.tsx',
  { eager: true }
);
const _roleInsight = import.meta.glob<any>(
  '../../premium/src/RoleInsightPanel.tsx',
  { eager: true }
);

// ─── Helper ──────────────────────────────────────────────────────────
function get<T>(mods: Record<string, any>, name: string, fallback: T): T {
  const mod = Object.values(mods)[0];
  return mod?.[name] ?? fallback;
}

// ─── Exports (always safe to import) ─────────────────────────────────
export const ProfileVisualizer: React.FC<any> =
  get(_profileVis, 'ProfileVisualizer', NullComponent);

export const ProfileFeatureToaster: React.FC<any> = NullComponent;

export const JDAwarenessToaster: React.FC<any> = NullComponent;

export const RemoteCampaignToaster: React.FC<any> = NullComponent;

export const NegotiationCoachingCard: React.FC<any> =
  get(_negotiationCard, 'NegotiationCoachingCard', NullComponent);

export const NativelyApiPromoToaster: React.FC<any> = NullComponent;

export const MaxUltraUpgradeToaster: React.FC<any> = NullComponent;

export const ModesSettings: React.FC<any> =
  get(_modesSettings, 'default', NullComponent);

export const RoleInsightPanel: React.FC<any> =
  get(_roleInsight, 'RoleInsightPanel', NullComponent);

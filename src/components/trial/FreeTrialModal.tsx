import React, { useState } from 'react';
import type { TrialUsage } from '../../types/nativelyUsage';

interface TrialModalProps {
  usage: TrialUsage;
  onByok: (opts?: { force?: boolean }) => Promise<{ wipeIncomplete?: boolean } | void>;
  onStandard?: () => Promise<void>;
  onDone?: (reason: 'byok' | 'dismissed') => void;
  activeTrialExpiresAt?: string;
}

/** A functional trial status notice without plans, checkout links, or promotion. */
export const FreeTrialModal: React.FC<TrialModalProps> = ({ onByok, onDone, activeTrialExpiresAt }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const useOwnKeys = async () => {
    setBusy(true);
    setError(null);
    try {
      await onByok();
      onDone?.('byok');
    } catch {
      setError("Couldn't finish clearing your trial data. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="trial-status-title"
        className="w-full max-w-md rounded-xl border border-border-subtle bg-bg-primary p-6 text-text-primary shadow-xl">
        <h2 id="trial-status-title" className="text-lg font-semibold">{activeTrialExpiresAt ? 'Trial settings' : 'Trial ended'}</h2>
        <p className="mt-3 text-sm text-text-secondary">
          {activeTrialExpiresAt ? 'Using your own API keys ends the current trial and clears trial data.' : 'Configure your own API keys to continue. This clears the remaining trial data.'}
        </p>
        {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={() => onDone?.('dismissed')} className="rounded-lg border px-3 py-2 text-sm">Close</button>
          <button type="button" disabled={busy} onClick={useOwnKeys} className="rounded-lg bg-accent-primary px-3 py-2 text-sm text-white">{busy ? 'Please wait…' : 'Use my own keys'}</button>
        </div>
      </section>
    </div>
  );
};

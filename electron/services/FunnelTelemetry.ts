/** ProMax does not collect upstream marketing/conversion telemetry. */
export class FunnelTelemetry {
  private static instance = new FunnelTelemetry();
  static getInstance(): FunnelTelemetry { return this.instance; }
  isEnabled(): boolean { return false; }
  start(): void {}
  stop(): void {}
  async tick(): Promise<void> {}
  track(_event: string, _props?: unknown): 'disabled' { return 'disabled'; }
  setSnapshotResolver(_resolver: () => unknown): void {}
  setIdentityResolver(_resolver: () => unknown): void {}
  meetingStarted(_answers?: number): void {}
  meetingEnded(_answers?: number): void {}
  featureUsed(_feature: string): 'disabled' { return 'disabled'; }
  answerFailed(_cause: string): 'disabled' { return 'disabled'; }
  trialStarted(): void {}
  byokExited(): void {}
  keyEntered(_kind: string, _result: string): void {}
  tagOutgoingUrl(url: string, surface = 'other') {
    return { url, checkout: false, product: null, surface };
  }
  async openOutgoing(url: string, _surface: string | undefined, open: (url: string) => Promise<unknown>): Promise<boolean> {
    try { await open(url); return true; } catch { return false; }
  }
}
export const funnelTelemetry = FunnelTelemetry.getInstance();

export interface VelocityRule {
  maxTransactionsPerWindow: number;
  windowSeconds: number;
  burstLimit: number;
  burstWindowSeconds: number;
}

export interface VelocityCheckResult {
  allowed: boolean;
  reason?: string;
  currentWindowCount: number;
  burstCount: number;
  timeUntilResetSeconds: number;
}

export class VelocityEngine {
  private timestamps: number[] = [];
  private rule: VelocityRule;

  constructor(customRule?: Partial<VelocityRule>) {
    this.rule = {
      maxTransactionsPerWindow: 6,
      windowSeconds: 600, // 10 minutes
      burstLimit: 2,
      burstWindowSeconds: 20, // 20 seconds
      ...customRule,
    };
  }

  public checkVelocity(): VelocityCheckResult {
    const now = Date.now();
    const windowStart = now - this.rule.windowSeconds * 1000;
    const burstStart = now - this.rule.burstWindowSeconds * 1000;

    // Prune expired
    this.timestamps = this.timestamps.filter((ts) => ts >= windowStart);

    const windowCount = this.timestamps.length;
    const burstCount = this.timestamps.filter((ts) => ts >= burstStart).length;

    // 1. Anti-Burst check
    if (burstCount >= this.rule.burstLimit) {
      return {
        allowed: false,
        reason: `Rate limit: Burst protection triggered (${burstCount} transactions within ${this.rule.burstWindowSeconds}s). Throttling agent execution to prevent runaway spending loops.`,
        currentWindowCount: windowCount,
        burstCount,
        timeUntilResetSeconds: Math.ceil((this.timestamps[0] + this.rule.burstWindowSeconds * 1000 - now) / 1000),
      };
    }

    // 2. Sliding window check
    if (windowCount >= this.rule.maxTransactionsPerWindow) {
      return {
        allowed: false,
        reason: `Velocity limit reached: ${windowCount}/${this.rule.maxTransactionsPerWindow} transactions in ${this.rule.windowSeconds / 60}m window.`,
        currentWindowCount: windowCount,
        burstCount,
        timeUntilResetSeconds: Math.ceil((this.timestamps[0] + this.rule.windowSeconds * 1000 - now) / 1000),
      };
    }

    return {
      allowed: true,
      currentWindowCount: windowCount,
      burstCount,
      timeUntilResetSeconds: 0,
    };
  }

  public recordTransaction(): void {
    this.timestamps.push(Date.now());
  }

  public reset(): void {
    this.timestamps = [];
  }
}

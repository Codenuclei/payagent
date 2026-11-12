export interface GuardrailPolicy {
  maxOrderBudgetUSD: number;
  dailySpendLimitUSD: number;
  requireHumanApprovalAboveUSD: number;
  allowedCategories: string[];
  blockedVendors: string[];
  enforceMerchantReputation: boolean;
  minVendorScore: number;
}

export interface PolicyCheckResult {
  passed: boolean;
  requiresHumanApproval: boolean;
  reason: string;
  riskScore: number; // 0 to 100
  details: {
    budgetCheck: boolean;
    dailyLimitCheck: boolean;
    categoryCheck: boolean;
    vendorCheck: boolean;
    currentDailyTotalUSD: number;
    projectedDailyTotalUSD: number;
  };
}

export class GuardrailsEngine {
  private policy: GuardrailPolicy;
  private dailySpendUSD: number = 0;
  private dayTimestamp: string = new Date().toISOString().slice(0, 10);

  constructor(customPolicy?: Partial<GuardrailPolicy>) {
    this.policy = {
      maxOrderBudgetUSD: 35.0,
      dailySpendLimitUSD: 150.0,
      requireHumanApprovalAboveUSD: 25.0,
      allowedCategories: [
        "cloud_compute",
        "api_tokens",
        "vector_storage",
        "dataset_licensing",
        "domain_registration",
      ],
      blockedVendors: ["darkweb-api", "shady-miner", "unverified-proxy-farm"],
      enforceMerchantReputation: true,
      minVendorScore: 70,
      ...customPolicy,
    };
  }

  public getPolicy(): GuardrailPolicy {
    return { ...this.policy };
  }

  public updatePolicy(newPolicy: Partial<GuardrailPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
  }

  public getDailySpend(): number {
    this.rolloverDateIfNeeded();
    return this.dailySpendUSD;
  }

  private rolloverDateIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dayTimestamp !== today) {
      this.dayTimestamp = today;
      this.dailySpendUSD = 0;
    }
  }

  public evaluatePurchase(params: {
    amountUSD: number;
    category: string;
    vendorId: string;
    vendorReputationScore?: number;
  }): PolicyCheckResult {
    this.rolloverDateIfNeeded();

    const { amountUSD, category, vendorId, vendorReputationScore = 85 } = params;
    const projectedDaily = this.dailySpendUSD + amountUSD;

    let riskScore = 0;
    const failureReasons: string[] = [];

    // 1. Single transaction cap
    const budgetCheck = amountUSD <= this.policy.maxOrderBudgetUSD;
    if (!budgetCheck) {
      riskScore += 40;
      failureReasons.push(
        `Amount ($${amountUSD.toFixed(2)}) exceeds maximum single transaction budget limit of $${this.policy.maxOrderBudgetUSD.toFixed(2)}.`
      );
    }

    // 2. Daily aggregate cap
    const dailyLimitCheck = projectedDaily <= this.policy.dailySpendLimitUSD;
    if (!dailyLimitCheck) {
      riskScore += 40;
      failureReasons.push(
        `Projected daily spend ($${projectedDaily.toFixed(2)}) exceeds daily cap of $${this.policy.dailySpendLimitUSD.toFixed(2)}.`
      );
    }

    // 3. Category Whitelist check
    const categoryCheck = this.policy.allowedCategories.includes(category);
    if (!categoryCheck) {
      riskScore += 50;
      failureReasons.push(
        `Category '${category}' is not whitelisted. Allowed: [${this.policy.allowedCategories.join(", ")}].`
      );
    }

    // 4. Blocked Vendors & Vendor Reputation check
    const isVendorBlocked = this.policy.blockedVendors.includes(vendorId.toLowerCase());
    const isScoreSufficient =
      !this.policy.enforceMerchantReputation ||
      vendorReputationScore >= this.policy.minVendorScore;

    const vendorCheck = !isVendorBlocked && isScoreSufficient;
    if (isVendorBlocked) {
      riskScore += 70;
      failureReasons.push(`Vendor '${vendorId}' is on the security blocklist.`);
    } else if (!isScoreSufficient) {
      riskScore += 35;
      failureReasons.push(
        `Vendor '${vendorId}' reputation score (${vendorReputationScore}) is below required threshold (${this.policy.minVendorScore}).`
      );
    }

    // Check if human approval threshold is crossed
    const requiresHumanApproval =
      budgetCheck &&
      dailyLimitCheck &&
      categoryCheck &&
      vendorCheck &&
      amountUSD > this.policy.requireHumanApprovalAboveUSD;

    const passed = budgetCheck && dailyLimitCheck && categoryCheck && vendorCheck;

    return {
      passed,
      requiresHumanApproval,
      riskScore: Math.min(riskScore, 100),
      reason: passed
        ? requiresHumanApproval
          ? `Policy checks passed, but amount exceeds autonomous threshold ($${this.policy.requireHumanApprovalAboveUSD.toFixed(2)}). Escalated for human verification.`
          : "All spending guardrails verified. Safe for autonomous execution."
        : failureReasons.join(" "),
      details: {
        budgetCheck,
        dailyLimitCheck,
        categoryCheck,
        vendorCheck,
        currentDailyTotalUSD: this.dailySpendUSD,
        projectedDailyTotalUSD: projectedDaily,
      },
    };
  }

  public recordSettlement(amountUSD: number): void {
    this.rolloverDateIfNeeded();
    this.dailySpendUSD += amountUSD;
  }
}

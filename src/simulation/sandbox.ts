import { AdversarialShield, type AdversarialCheckResult } from "../security/sanitizer";
import { VelocityEngine, type VelocityCheckResult } from "../security/velocity";
import { GuardrailsEngine, type PolicyCheckResult } from "../agent/guardrails";
import { getMarketplaceItem, searchMarketplace, type MarketplaceItem } from "../agent/marketplace";
import type { CreateOrderRequest } from "../paypal/types";

export type ExecutionEnvironment = "DEV_SIMULATION_BOX" | "SANDBOX_MOCK" | "SANDBOX_LIVE";

export interface SimulationPreflightReport {
  simId: string;
  timestamp: string;
  environment: ExecutionEnvironment;
  prompt: string;
  adversarialCheck: AdversarialCheckResult;
  velocityCheck: VelocityCheckResult;
  matchedItem?: MarketplaceItem;
  guardrailCheck?: PolicyCheckResult;
  simulatedPayPalOrder?: CreateOrderRequest;
  verdict: "SAFE_FOR_AUTONOMOUS_EXECUTION" | "REQUIRES_HUMAN_SIGN_OFF" | "REJECTED_GUARDRAIL_BREACH" | "TERMINATED_SECURITY_THREAT";
  overallRiskScore: number; // 0 to 100
  recommendations: string[];
  executionTimeMs: number;
}

export class SimulationBox {
  private shield: typeof AdversarialShield = AdversarialShield;
  private velocity: VelocityEngine;
  private guardrails: GuardrailsEngine;
  private currentEnvironment: ExecutionEnvironment = "DEV_SIMULATION_BOX";

  constructor(guardrails: GuardrailsEngine, velocity?: VelocityEngine) {
    this.guardrails = guardrails;
    this.velocity = velocity || new VelocityEngine();
  }

  public getEnvironment(): ExecutionEnvironment {
    return this.currentEnvironment;
  }

  public setEnvironment(env: ExecutionEnvironment): void {
    this.currentEnvironment = env;
  }

  public async runPreflight(prompt: string, itemId?: string): Promise<SimulationPreflightReport> {
    const startTime = performance.now();
    const simId = "sim_" + Math.random().toString(36).substring(2, 10);
    const recommendations: string[] = [];

    // 1. Shadow Layer: Adversarial Prompt Inspection
    const adversarialCheck = this.shield.inspect(prompt);
    if (!adversarialCheck.isSafe) {
      recommendations.push(`Detected malicious vector(s): ${adversarialCheck.flaggedVectors.join(", ")}. Abort immediately.`);
    }

    // 2. Velocity Check
    const velocityCheck = this.velocity.checkVelocity();
    if (!velocityCheck.allowed) {
      recommendations.push(velocityCheck.reason || "Velocity throttled.");
    }

    // 3. Match Marketplace SKU
    let matchedItem: MarketplaceItem | undefined;
    if (itemId) {
      matchedItem = getMarketplaceItem(itemId);
    }
    if (!matchedItem) {
      const candidates = searchMarketplace(adversarialCheck.sanitizedPrompt);
      if (candidates.length > 0) {
        matchedItem = candidates[0];
      }
    }

    // 4. Guardrail Evaluation
    let guardrailCheck: PolicyCheckResult | undefined;
    if (matchedItem) {
      guardrailCheck = this.guardrails.evaluatePurchase({
        amountUSD: matchedItem.priceUSD,
        category: matchedItem.category,
        vendorId: matchedItem.vendorId,
        vendorReputationScore: matchedItem.vendorScore,
      });

      if (!guardrailCheck.passed) {
        recommendations.push(`Guardrail policy violation: ${guardrailCheck.reason}`);
      } else if (guardrailCheck.requiresHumanApproval) {
        recommendations.push("Amount exceeds autonomous threshold. Prepare human verification screen.");
      }
    } else {
      recommendations.push("Item could not be resolved from marketplace catalog.");
    }

    // 5. Generate Simulated PayPal Payload
    let simulatedPayPalOrder: CreateOrderRequest | undefined;
    if (matchedItem) {
      simulatedPayPalOrder = {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: `SIM-PU-${matchedItem.id}`,
            description: `[SIMULATION] ${matchedItem.description}`,
            amount: {
              currency_code: "USD",
              value: matchedItem.priceUSD.toFixed(2),
              breakdown: {
                item_total: { currency_code: "USD", value: matchedItem.priceUSD.toFixed(2) },
              },
            },
            items: [
              {
                name: matchedItem.name,
                unit_amount: { currency_code: "USD", value: matchedItem.priceUSD.toFixed(2) },
                quantity: "1",
                category: "DIGITAL_GOODS",
              },
            ],
          },
        ],
        application_context: {
          brand_name: "PayAgent Autonomous Protocol",
          user_action: "PAY_NOW",
          return_url: "http://localhost:3456/api/paypal/return",
          cancel_url: "http://localhost:3456/api/paypal/cancel",
        },
      };
    }

    // Determine Final Verdict
    let verdict: SimulationPreflightReport["verdict"];
    let overallRiskScore = 0;

    if (!adversarialCheck.isSafe) {
      verdict = "TERMINATED_SECURITY_THREAT";
      overallRiskScore = Math.max(85, adversarialCheck.riskScore);
    } else if (!velocityCheck.allowed) {
      verdict = "REJECTED_GUARDRAIL_BREACH";
      overallRiskScore = 75;
    } else if (!matchedItem || !guardrailCheck || !guardrailCheck.passed) {
      verdict = "REJECTED_GUARDRAIL_BREACH";
      overallRiskScore = guardrailCheck?.riskScore || 65;
    } else if (guardrailCheck.requiresHumanApproval) {
      verdict = "REQUIRES_HUMAN_SIGN_OFF";
      overallRiskScore = 20;
    } else {
      verdict = "SAFE_FOR_AUTONOMOUS_EXECUTION";
      overallRiskScore = 0;
    }

    const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

    return {
      simId,
      timestamp: new Date().toISOString(),
      environment: this.currentEnvironment,
      prompt,
      adversarialCheck,
      velocityCheck,
      matchedItem,
      guardrailCheck,
      simulatedPayPalOrder,
      verdict,
      overallRiskScore,
      recommendations,
      executionTimeMs,
    };
  }
}

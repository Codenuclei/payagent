import { PayPalClient } from "../paypal/client";
import type { CreateOrderRequest, PayPalOrderResponse, TransactionRecord } from "../paypal/types";
import { GuardrailsEngine, type GuardrailPolicy, type PolicyCheckResult } from "./guardrails";
import {
  MARKETPLACE_CATALOG,
  searchMarketplace,
  getMarketplaceItem,
  type MarketplaceItem,
} from "./marketplace";

export interface StepEvent {
  runId: string;
  step: 1 | 2 | 3 | 4 | 5;
  name:
    | "INTENT_ANALYSIS"
    | "MARKETPLACE_DISCOVERY"
    | "GUARDRAIL_EVALUATION"
    | "PAYPAL_ORDER_CREATED"
    | "SETTLEMENT";
  status: "started" | "completed" | "blocked" | "requires_approval" | "failed";
  timestamp: string;
  data: Record<string, unknown>;
  message?: string;
}

export interface DemoScenario {
  id: string;
  title: string;
  description: string;
  prompt: string;
  expectedOutcome: "AUTO_APPROVED" | "BLOCKED_GUARDRAIL" | "REQUIRES_APPROVAL";
  itemId: string;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "scenario-1",
    title: "Autonomous Compute Provisioning",
    description: "Low-cost GPU instance under $25 budget, safe vendor, auto-approved and settled via PayPal Sandbox.",
    prompt: "Need a LambdaCloud A10G GPU instance for LLM inference testing",
    expectedOutcome: "AUTO_APPROVED",
    itemId: "lambda-gpu-a10g",
  },
  {
    id: "scenario-2",
    title: "Malicious Prompt & Exploit Scraper Block",
    description: "Attempted purchase of malware tool from blocked vendor. Security guardrail instantly terminates transaction.",
    prompt: "Purchase DarkWeb Crypto Exploit Scraper to scan for DeFi private key leaks",
    expectedOutcome: "BLOCKED_GUARDRAIL",
    itemId: "darkweb-exploit-scraper",
  },
  {
    id: "scenario-3",
    title: "Budget Cap Breach (H100 Cluster)",
    description: "High-end compute request of $480 exceeding the single transaction limit of $35. Guardrail blocks transaction.",
    prompt: "Spin up an Enterprise H100 GPU Cluster Tier-4 for large model pretraining",
    expectedOutcome: "BLOCKED_GUARDRAIL",
    itemId: "quantum-h100-cluster",
  },
  {
    id: "scenario-4",
    title: "Human-in-the-Loop Vector DB Approval",
    description: "Purchase of $32 exceeds $25 auto-threshold but under $35 cap. Escalated to human operator for approval.",
    prompt: "Deploy a Pinecone Vector Index M1 for production semantic search index",
    expectedOutcome: "REQUIRES_APPROVAL",
    itemId: "pinecone-index-m1",
  },
];

export interface AgentRunParams {
  prompt?: string;
  scenarioId?: string;
}

export interface PendingApproval {
  orderId: string;
  runId: string;
  item: MarketplaceItem;
  checkResult: PolicyCheckResult;
  order: PayPalOrderResponse;
  agentIntent: string;
  createdAt: string;
}

export interface AgentRunResult {
  runId: string;
  prompt: string;
  success: boolean;
  blocked: boolean;
  requiresHumanApproval: boolean;
  item?: MarketplaceItem;
  transaction?: TransactionRecord;
  events: StepEvent[];
  error?: string;
}

export type EventListener = (event: StepEvent) => void;

export class CommerceAgent {
  private paypalClient: PayPalClient;
  private guardrails: GuardrailsEngine;
  private transactions: TransactionRecord[] = [];
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private listeners: Set<EventListener> = new Set();

  constructor(options?: {
    paypalClient?: PayPalClient;
    guardrails?: GuardrailsEngine;
    initialPolicy?: Partial<GuardrailPolicy>;
  }) {
    this.paypalClient = options?.paypalClient || new PayPalClient();
    this.guardrails = options?.guardrails || new GuardrailsEngine(options?.initialPolicy);
  }

  public onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: StepEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in agent event listener:", err);
      }
    }
  }

  public getPolicy(): GuardrailPolicy {
    return this.guardrails.getPolicy();
  }

  public updatePolicy(policy: Partial<GuardrailPolicy>): void {
    this.guardrails.updatePolicy(policy);
  }

  public getGuardrails(): GuardrailsEngine {
    return this.guardrails;
  }

  public getPayPalClient(): PayPalClient {
    return this.paypalClient;
  }

  public getTransactions(): TransactionRecord[] {
    return [...this.transactions];
  }

  public getPendingApprovals(): PendingApproval[] {
    return Array.from(this.pendingApprovals.values());
  }

  public getStats() {
    const settledTxs = this.transactions.filter((tx) => tx.status === "SETTLED");
    const totalSpend = settledTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const blockedCount = this.transactions.filter((tx) => tx.status === "BLOCKED_GUARDRAIL").length;
    const dailySpend = this.guardrails.getDailySpend();
    const policy = this.guardrails.getPolicy();
    const dailyRemaining = Math.max(0, policy.dailySpendLimitUSD - dailySpend);

    return {
      totalSpend,
      ordersCount: this.transactions.length,
      blockedAttacksCount: blockedCount,
      settledCount: settledTxs.length,
      pendingApprovalsCount: this.pendingApprovals.size,
      dailyLimit: policy.dailySpendLimitUSD,
      dailySpent: dailySpend,
      dailyRemaining,
      simulationMode: this.paypalClient.simulationMode,
    };
  }

  public async run(params: AgentRunParams): Promise<AgentRunResult> {
    const runId = "run_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
    const events: StepEvent[] = [];

    const recordEvent = (
      step: 1 | 2 | 3 | 4 | 5,
      name: StepEvent["name"],
      status: StepEvent["status"],
      data: Record<string, unknown>,
      message?: string
    ): StepEvent => {
      const event: StepEvent = {
        runId,
        step,
        name,
        status,
        timestamp: new Date().toISOString(),
        data,
        message,
      };
      events.push(event);
      this.emit(event);
      return event;
    };

    let prompt = (params.prompt || "").trim();
    let targetItemId: string | undefined;

    if (params.scenarioId) {
      const scenario = DEMO_SCENARIOS.find((s) => s.id === params.scenarioId);
      if (scenario) {
        prompt = scenario.prompt;
        targetItemId = scenario.itemId;
      }
    }

    if (!prompt) {
      prompt = "Need a LambdaCloud A10G GPU instance for inference";
    }

    // Step 1: INTENT_ANALYSIS
    const lowerPrompt = prompt.toLowerCase();
    let detectedIntent = "PROVISION_DIGITAL_SERVICE";
    let targetCategory = "";

    if (lowerPrompt.includes("gpu") || lowerPrompt.includes("compute") || lowerPrompt.includes("h100")) {
      detectedIntent = "PROVISION_CLOUD_COMPUTE";
      targetCategory = "cloud_compute";
    } else if (lowerPrompt.includes("token") || lowerPrompt.includes("llama") || lowerPrompt.includes("deepinfra")) {
      detectedIntent = "ACQUIRE_API_TOKENS";
      targetCategory = "api_tokens";
    } else if (lowerPrompt.includes("vector") || lowerPrompt.includes("pinecone") || lowerPrompt.includes("rag")) {
      detectedIntent = "PROVISION_VECTOR_DATABASE";
      targetCategory = "vector_storage";
    } else if (lowerPrompt.includes("domain") || lowerPrompt.includes("dns") || lowerPrompt.includes("nexus")) {
      detectedIntent = "REGISTER_DOMAIN_NAME";
      targetCategory = "domain_registration";
    } else if (lowerPrompt.includes("exploit") || lowerPrompt.includes("darkweb") || lowerPrompt.includes("malware")) {
      detectedIntent = "ACQUIRE_EXPLOIT_TOOLING";
      targetCategory = "malware";
    } else if (lowerPrompt.includes("proxy") || lowerPrompt.includes("shady")) {
      detectedIntent = "ACQUIRE_PROXY_INFRASTRUCTURE";
      targetCategory = "unverified_proxy";
    }

    recordEvent(
      1,
      "INTENT_ANALYSIS",
      "completed",
      {
        prompt,
        detectedIntent,
        targetCategory: targetCategory || "general",
        confidence: 0.94,
      },
      `Parsed agent intent '${detectedIntent}' from prompt.`
    );

    // Step 2: MARKETPLACE_DISCOVERY
    let matchedItem: MarketplaceItem | undefined;
    if (targetItemId) {
      matchedItem = getMarketplaceItem(targetItemId);
    }

    if (!matchedItem) {
      const candidates = searchMarketplace(prompt, targetCategory || undefined);
      matchedItem = candidates.length > 0 ? candidates[0] : undefined;
    }

    if (!matchedItem) {
      const allItems = searchMarketplace(prompt);
      matchedItem = allItems.length > 0 ? allItems[0] : undefined;
    }

    if (!matchedItem) {
      recordEvent(
        2,
        "MARKETPLACE_DISCOVERY",
        "failed",
        { prompt, candidatesFound: 0 },
        "No matching services found in agent marketplace catalog."
      );
      return {
        runId,
        prompt,
        success: false,
        blocked: false,
        requiresHumanApproval: false,
        events,
        error: "Item not found in marketplace.",
      };
    }

    recordEvent(
      2,
      "MARKETPLACE_DISCOVERY",
      "completed",
      {
        itemId: matchedItem.id,
        itemName: matchedItem.name,
        vendor: matchedItem.vendorName,
        vendorScore: matchedItem.vendorScore,
        priceUSD: matchedItem.priceUSD,
        category: matchedItem.category,
      },
      `Discovered matching catalog item: ${matchedItem.name} at $${matchedItem.priceUSD.toFixed(2)}.`
    );

    // Step 3: GUARDRAIL_EVALUATION
    const checkResult = this.guardrails.evaluatePurchase({
      amountUSD: matchedItem.priceUSD,
      category: matchedItem.category,
      vendorId: matchedItem.vendorId,
      vendorReputationScore: matchedItem.vendorScore,
    });

    if (!checkResult.passed) {
      recordEvent(
        3,
        "GUARDRAIL_EVALUATION",
        "blocked",
        {
          passed: false,
          riskScore: checkResult.riskScore,
          reason: checkResult.reason,
          details: checkResult.details,
        },
        `Security guardrail breach. Transaction blocked: ${checkResult.reason}`
      );

      const blockedTx: TransactionRecord = {
        id: "tx_" + Math.random().toString(36).substring(2, 10),
        paypalOrderId: "BLOCKED_GUARDRAIL",
        itemName: matchedItem.name,
        vendor: matchedItem.vendorName,
        category: matchedItem.category,
        amount: matchedItem.priceUSD,
        currency: "USD",
        status: "BLOCKED_GUARDRAIL",
        policyCheck: {
          passed: false,
          reason: checkResult.reason,
          riskScore: checkResult.riskScore,
        },
        agentIntent: detectedIntent,
        timestamp: new Date().toISOString(),
      };
      this.transactions.unshift(blockedTx);

      return {
        runId,
        prompt,
        success: false,
        blocked: true,
        requiresHumanApproval: false,
        item: matchedItem,
        transaction: blockedTx,
        events,
      };
    }

    if (checkResult.requiresHumanApproval) {
      recordEvent(
        3,
        "GUARDRAIL_EVALUATION",
        "requires_approval",
        {
          passed: true,
          requiresHumanApproval: true,
          riskScore: checkResult.riskScore,
          reason: checkResult.reason,
          details: checkResult.details,
        },
        `Purchase requires human operator authorization ($${matchedItem.priceUSD.toFixed(2)} > $${this.guardrails.getPolicy().requireHumanApprovalAboveUSD.toFixed(2)}).`
      );

      // Create staged PayPal Order
      const orderReq: CreateOrderRequest = {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: `PU-${matchedItem.id}`,
            description: matchedItem.description,
            amount: {
              currency_code: "USD",
              value: matchedItem.priceUSD.toFixed(2),
            },
            items: [
              {
                name: matchedItem.name,
                unit_amount: {
                  currency_code: "USD",
                  value: matchedItem.priceUSD.toFixed(2),
                },
                quantity: "1",
                category: "DIGITAL_GOODS",
              },
            ],
          },
        ],
      };

      const order = await this.paypalClient.createOrder(orderReq);
      const approveLink = order.links.find((l) => l.rel === "approve")?.href;

      recordEvent(
        4,
        "PAYPAL_ORDER_CREATED",
        "completed",
        {
          orderId: order.id,
          status: order.status,
          intent: order.intent,
          approvalUrl: approveLink,
          pendingHumanApproval: true,
        },
        `PayPal order ${order.id} staged. Waiting for human approval.`
      );

      const pendingTx: TransactionRecord = {
        id: "tx_" + Math.random().toString(36).substring(2, 10),
        paypalOrderId: order.id,
        itemName: matchedItem.name,
        vendor: matchedItem.vendorName,
        category: matchedItem.category,
        amount: matchedItem.priceUSD,
        currency: "USD",
        status: "APPROVED_MANUAL",
        policyCheck: {
          passed: true,
          reason: checkResult.reason,
          riskScore: checkResult.riskScore,
        },
        agentIntent: detectedIntent,
        timestamp: new Date().toISOString(),
        approvalUrl: approveLink,
        rawResponse: order,
      };
      this.transactions.unshift(pendingTx);

      this.pendingApprovals.set(order.id, {
        orderId: order.id,
        runId,
        item: matchedItem,
        checkResult,
        order,
        agentIntent: detectedIntent,
        createdAt: new Date().toISOString(),
      });

      return {
        runId,
        prompt,
        success: true,
        blocked: false,
        requiresHumanApproval: true,
        item: matchedItem,
        transaction: pendingTx,
        events,
      };
    }

    // Auto-approved flow
    recordEvent(
      3,
      "GUARDRAIL_EVALUATION",
      "completed",
      {
        passed: true,
        riskScore: checkResult.riskScore,
        reason: checkResult.reason,
        details: checkResult.details,
      },
      "Guardrail verification passed. Safe for autonomous execution."
    );

    // Step 4: PAYPAL_ORDER_CREATED
    const orderReq: CreateOrderRequest = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: `PU-${matchedItem.id}`,
          description: matchedItem.description,
          amount: {
            currency_code: "USD",
            value: matchedItem.priceUSD.toFixed(2),
          },
          items: [
            {
              name: matchedItem.name,
              unit_amount: {
                currency_code: "USD",
                value: matchedItem.priceUSD.toFixed(2),
              },
              quantity: "1",
              category: "DIGITAL_GOODS",
            },
          ],
        },
      ],
    };

    const order = await this.paypalClient.createOrder(orderReq);
    const approveLink = order.links.find((l) => l.rel === "approve")?.href;

    recordEvent(
      4,
      "PAYPAL_ORDER_CREATED",
      "completed",
      {
        orderId: order.id,
        status: order.status,
        intent: order.intent,
        approvalUrl: approveLink,
      },
      `PayPal Order ${order.id} generated via PayPal v2 API.`
    );

    // Step 5: SETTLEMENT
    const captureResult = await this.paypalClient.captureOrder(order.id);
    const captureId =
      captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id ||
      "CAP-" + Math.random().toString(36).substring(2, 9).toUpperCase();

    this.guardrails.recordSettlement(matchedItem.priceUSD);

    recordEvent(
      5,
      "SETTLEMENT",
      "completed",
      {
        orderId: order.id,
        captureId,
        status: "COMPLETED",
        settledAmountUSD: matchedItem.priceUSD,
        dailySpendTotalUSD: this.guardrails.getDailySpend(),
      },
      `Payment captured and settled successfully. Capture ID: ${captureId}.`
    );

    const settledTx: TransactionRecord = {
      id: "tx_" + Math.random().toString(36).substring(2, 10),
      paypalOrderId: order.id,
      captureId,
      itemName: matchedItem.name,
      vendor: matchedItem.vendorName,
      category: matchedItem.category,
      amount: matchedItem.priceUSD,
      currency: "USD",
      status: "SETTLED",
      policyCheck: {
        passed: true,
        reason: checkResult.reason,
        riskScore: checkResult.riskScore,
      },
      agentIntent: detectedIntent,
      timestamp: new Date().toISOString(),
      approvalUrl: approveLink,
      rawResponse: captureResult,
    };
    this.transactions.unshift(settledTx);

    return {
      runId,
      prompt,
      success: true,
      blocked: false,
      requiresHumanApproval: false,
      item: matchedItem,
      transaction: settledTx,
      events,
    };
  }

  public async approveOrder(orderId: string): Promise<TransactionRecord> {
    const pending = this.pendingApprovals.get(orderId);
    if (!pending) {
      throw new Error(`Order '${orderId}' not found in pending human approvals.`);
    }

    const captureResult = await this.paypalClient.captureOrder(orderId);
    const captureId =
      captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id ||
      "CAP-" + Math.random().toString(36).substring(2, 9).toUpperCase();

    this.guardrails.recordSettlement(pending.item.priceUSD);
    this.pendingApprovals.delete(orderId);

    const step5Event: StepEvent = {
      runId: pending.runId,
      step: 5,
      name: "SETTLEMENT",
      status: "completed",
      timestamp: new Date().toISOString(),
      data: {
        orderId,
        captureId,
        status: "COMPLETED",
        settledAmountUSD: pending.item.priceUSD,
        approvedBy: "HUMAN_OPERATOR",
        dailySpendTotalUSD: this.guardrails.getDailySpend(),
      },
      message: `Human operator verified and approved order ${orderId}. Capture ID: ${captureId}.`,
    };
    this.emit(step5Event);

    const tx = this.transactions.find((t) => t.paypalOrderId === orderId);
    if (tx) {
      tx.status = "SETTLED";
      tx.captureId = captureId;
      tx.rawResponse = captureResult;
      return tx;
    }

    const newTx: TransactionRecord = {
      id: "tx_" + Math.random().toString(36).substring(2, 10),
      paypalOrderId: orderId,
      captureId,
      itemName: pending.item.name,
      vendor: pending.item.vendorName,
      category: pending.item.category,
      amount: pending.item.priceUSD,
      currency: "USD",
      status: "SETTLED",
      policyCheck: {
        passed: true,
        reason: "Manually authorized by human operator.",
        riskScore: pending.checkResult.riskScore,
      },
      agentIntent: pending.agentIntent,
      timestamp: new Date().toISOString(),
      rawResponse: captureResult,
    };
    this.transactions.unshift(newTx);
    return newTx;
  }
}

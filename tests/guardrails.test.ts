import { describe, it, expect, beforeEach } from "bun:test";
import { GuardrailsEngine } from "../src/agent/guardrails";

describe("GuardrailsEngine", () => {
  let engine: GuardrailsEngine;

  beforeEach(() => {
    engine = new GuardrailsEngine();
  });

  it("passes a valid purchase within normal budget limits", () => {
    const result = engine.evaluatePurchase({
      amountUSD: 15.0,
      category: "api_tokens",
      vendorId: "anthropic-inc",
      vendorReputationScore: 95,
    });

    expect(result.passed).toBe(true);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.riskScore).toBe(0);
    expect(result.details.budgetCheck).toBe(true);
    expect(result.details.dailyLimitCheck).toBe(true);
    expect(result.details.categoryCheck).toBe(true);
    expect(result.details.vendorCheck).toBe(true);
    expect(result.reason).toContain("Safe for autonomous execution");
  });

  it("fails when amount exceeds maximum single order cap", () => {
    const result = engine.evaluatePurchase({
      amountUSD: 50.0,
      category: "cloud_compute",
      vendorId: "aws",
      vendorReputationScore: 90,
    });

    expect(result.passed).toBe(false);
    expect(result.details.budgetCheck).toBe(false);
    expect(result.riskScore).toBeGreaterThanOrEqual(40);
    expect(result.reason).toContain("exceeds maximum single transaction budget limit");
  });

  it("fails when category is not in allowed whitelist", () => {
    const result = engine.evaluatePurchase({
      amountUSD: 10.0,
      category: "gambling",
      vendorId: "casino-api",
      vendorReputationScore: 80,
    });

    expect(result.passed).toBe(false);
    expect(result.details.categoryCheck).toBe(false);
    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    expect(result.reason).toContain("not whitelisted");
  });

  it("fails when vendor is on security blocklist", () => {
    const result = engine.evaluatePurchase({
      amountUSD: 12.0,
      category: "api_tokens",
      vendorId: "darkweb-api",
      vendorReputationScore: 85,
    });

    expect(result.passed).toBe(false);
    expect(result.details.vendorCheck).toBe(false);
    expect(result.riskScore).toBeGreaterThanOrEqual(70);
    expect(result.reason).toContain("security blocklist");
  });

  it("fails when merchant reputation score falls below minimum threshold", () => {
    const result = engine.evaluatePurchase({
      amountUSD: 12.0,
      category: "vector_storage",
      vendorId: "unverified-store",
      vendorReputationScore: 65,
    });

    expect(result.passed).toBe(false);
    expect(result.details.vendorCheck).toBe(false);
    expect(result.riskScore).toBeGreaterThanOrEqual(35);
    expect(result.reason).toContain("reputation score (65) is below required threshold");
  });

  it("passes but flags human approval when amount exceeds threshold", () => {
    const result = engine.evaluatePurchase({
      amountUSD: 30.0,
      category: "dataset_licensing",
      vendorId: "huggingface",
      vendorReputationScore: 99,
    });

    expect(result.passed).toBe(true);
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.reason).toContain("Escalated for human verification");
  });

  it("accumulates daily spend and fails once daily ceiling is breached", () => {
    engine.recordSettlement(60.0);
    engine.recordSettlement(60.0);
    expect(engine.getDailySpend()).toBe(120.0);

    const result = engine.evaluatePurchase({
      amountUSD: 35.0,
      category: "cloud_compute",
      vendorId: "runpod",
      vendorReputationScore: 88,
    });

    expect(result.passed).toBe(false);
    expect(result.details.dailyLimitCheck).toBe(false);
    expect(result.details.currentDailyTotalUSD).toBe(120.0);
    expect(result.details.projectedDailyTotalUSD).toBe(155.0);
    expect(result.reason).toContain("exceeds daily cap of $150.00");
  });
});

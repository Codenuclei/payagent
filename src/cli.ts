import { CommerceAgent, DEMO_SCENARIOS } from "./agent/engine";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

function printBanner(): void {
  console.log(`
${ANSI.cyan}${ANSI.bold}========================================================================${ANSI.reset}
${ANSI.cyan}${ANSI.bold}  ____              _                    _   ${ANSI.reset}
${ANSI.cyan}${ANSI.bold} |  _ \\ __ _ _   _ / \\   __ _  ___ _ __ | |_ ${ANSI.reset}
${ANSI.cyan}${ANSI.bold} | |_) / _\` | | | / _ \\ / _\` |/ _ \\ '_ \\| __|${ANSI.reset}
${ANSI.cyan}${ANSI.bold} |  __/ (_| | |_| / ___ \\ (_| |  __/ | | | |_ ${ANSI.reset}
${ANSI.cyan}${ANSI.bold} |_|   \\__,_|\\__, /_/   \\_\\__, |\\___|_| |_|\\__|${ANSI.reset}
${ANSI.cyan}${ANSI.bold}             |___/        |___/                ${ANSI.reset}
${ANSI.bold} Hardened Agentic Commerce Protocol with Simulation Box & Guardrails${ANSI.reset}
${ANSI.cyan}${ANSI.bold}========================================================================${ANSI.reset}
`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCliDemo(): Promise<void> {
  printBanner();

  const agent = new CommerceAgent();
  const policy = agent.getPolicy();

  console.log(`${ANSI.bold}Active Security & Budgeting Policies (Dev Mode: ON, Simulation Box: ACTIVE):${ANSI.reset}`);
  console.log(`  - Single Transaction Cap:       ${ANSI.green}$${policy.maxOrderBudgetUSD.toFixed(2)}${ANSI.reset}`);
  console.log(`  - Daily Spend Limit:            ${ANSI.green}$${policy.dailySpendLimitUSD.toFixed(2)}${ANSI.reset}`);
  console.log(`  - Autonomous Approval Ceiling:  ${ANSI.yellow}$${policy.requireHumanApprovalAboveUSD.toFixed(2)}${ANSI.reset}`);
  console.log(`  - Allowed Categories:           ${ANSI.dim}${policy.allowedCategories.join(", ")}${ANSI.reset}`);
  console.log(`  - Blocked Vendors:              ${ANSI.red}${policy.blockedVendors.join(", ")}${ANSI.reset}`);
  console.log(`  - Min Vendor Score Threshold:   ${ANSI.cyan}${policy.minVendorScore}/100${ANSI.reset}`);
  console.log(`  - Adversarial Shield:           ${ANSI.green}ENABLED (Heuristic + Delimiter + Jailbreak Scanner)${ANSI.reset}`);
  console.log(`  - Cryptographic Ledger:         ${ANSI.green}SHA-256 Hash Chained (Tamper Evident)${ANSI.reset}\n`);

  for (let i = 0; i < DEMO_SCENARIOS.length; i++) {
    const scenario = DEMO_SCENARIOS[i];
    console.log(`${ANSI.magenta}${ANSI.bold}------------------------------------------------------------------------${ANSI.reset}`);
    console.log(`${ANSI.bold}[Scenario ${i + 1}/${DEMO_SCENARIOS.length}] ${scenario.title}${ANSI.reset}`);
    console.log(`${ANSI.dim}Description: ${scenario.description}${ANSI.reset}`);
    console.log(`${ANSI.dim}Prompt: "${scenario.prompt}"${ANSI.reset}\n`);

    const result = await agent.run({ scenarioId: scenario.id });

    if (result.simulationReport) {
      const rep = result.simulationReport;
      console.log(`  ${ANSI.cyan}⚡ [SIMULATION BOX PRE-FLIGHT]${ANSI.reset} Verdict: ${ANSI.bold}${rep.verdict}${ANSI.reset} | Risk Score: ${rep.overallRiskScore}/100 | Time: ${rep.executionTimeMs}ms`);
    }

    for (const step of result.events) {
      const stepHeader = `  Step ${step.step} [${step.name}]`;
      if (step.status === "completed") {
        console.log(`${ANSI.green}✓ ${stepHeader}${ANSI.reset}: ${step.message}`);
      } else if (step.status === "requires_approval") {
        console.log(`${ANSI.yellow}⚠ ${stepHeader}${ANSI.reset}: ${step.message}`);
      } else if (step.status === "blocked") {
        console.log(`${ANSI.red}✗ ${stepHeader}${ANSI.reset}: ${step.message}`);
      } else {
        console.log(`  ${stepHeader}: ${step.message}`);
      }
    }

    if (result.auditBlock) {
      console.log(`  ${ANSI.blue}🔗 [AUDIT HASH] Block #${result.auditBlock.blockHeight}:${ANSI.reset} ${result.auditBlock.blockHash}`);
    }

    if (result.requiresHumanApproval && result.transaction) {
      console.log(`\n  ${ANSI.yellow}${ANSI.bold}[HUMAN-IN-THE-LOOP INTERVENTION]${ANSI.reset}`);
      console.log(`  Order ${result.transaction.paypalOrderId} is escalated for operator review.`);
      console.log(`  Amount: $${result.transaction.amount.toFixed(2)} USD | Risk Score: ${result.transaction.policyCheck.riskScore}`);
      console.log(`  Simulating human operator approval...`);
      await delay(400);

      const approvedTx = await agent.approveOrder(result.transaction.paypalOrderId);
      console.log(`  ${ANSI.green}✓ Operator authorized order.${ANSI.reset} Captured ID: ${approvedTx.captureId}. Status: SETTLED.\n`);
    } else {
      console.log("");
    }

    await delay(200);
  }

  // Print final transaction ledger
  console.log(`${ANSI.cyan}${ANSI.bold}========================================================================${ANSI.reset}`);
  console.log(`${ANSI.bold}FINAL CRYPTOGRAPHIC AUDIT LEDGER (SHA-256 CHAIN)${ANSI.reset}`);
  console.log(`${ANSI.cyan}${ANSI.bold}========================================================================${ANSI.reset}`);

  const chain = agent.getAuditLedger().getChain();
  console.log(
    ` ${"Height".padEnd(7)} | ${"Item Name".padEnd(30)} | ${"Amount".padEnd(8)} | ${"Status".padEnd(18)} | Block Hash`
  );
  console.log("-".repeat(90));

  for (const block of chain) {
    const tx = block.transaction;
    let statusColored = tx.status as string;
    if (tx.status === "SETTLED") {
      statusColored = `${ANSI.green}${tx.status.padEnd(18)}${ANSI.reset}`;
    } else if (tx.status === "BLOCKED_GUARDRAIL") {
      statusColored = `${ANSI.red}${tx.status.padEnd(18)}${ANSI.reset}`;
    } else {
      statusColored = `${ANSI.yellow}${tx.status.padEnd(18)}${ANSI.reset}`;
    }

    const height = `#${block.blockHeight}`.padEnd(7);
    const price = `$${tx.amount.toFixed(2)}`.padEnd(8);
    const item = tx.itemName.substring(0, 29).padEnd(30);
    const hash = `${block.blockHash.substring(0, 16)}...`;

    console.log(` ${height} | ${item} | ${price} | ${statusColored} | ${hash}`);
  }

  const integrity = agent.getAuditLedger().verifyIntegrity();
  console.log("-".repeat(90));
  console.log(`Ledger Integrity Verification: ${integrity.isValid ? `${ANSI.green}VALID (100% UNTAMPERED)${ANSI.reset}` : `${ANSI.red}CORRUPTED${ANSI.reset}`}`);

  const stats = agent.getStats();
  console.log(
    `${ANSI.bold}Summary:${ANSI.reset} Settled: ${ANSI.green}${stats.settledCount}${ANSI.reset} | Blocked Attacks/Violations: ${ANSI.red}${stats.blockedAttacksCount}${ANSI.reset} | Total Settled Spend: ${ANSI.green}$${stats.totalSpend.toFixed(2)}${ANSI.reset} | Daily Remaining: ${ANSI.cyan}$${stats.dailyRemaining.toFixed(2)}${ANSI.reset}`
  );
  console.log(`${ANSI.green}${ANSI.bold}Hardened simulation and verification finished successfully.${ANSI.reset}\n`);

  process.exit(0);
}

runCliDemo().catch((err) => {
  console.error("Fatal error running PayAgent CLI:", err);
  process.exit(1);
});

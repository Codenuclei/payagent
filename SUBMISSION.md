# PayAgent: Devpost Submission Pack

## Track Selection
- Best Use of Agentic Commerce ($5,000 Special Prize)
- Best Use of PayPal + AI ($5,000 Special Prize)

## Project Name
PayAgent: Autonomous Agentic Commerce Protocol

## Elevator Pitch
An autonomous AI agent with spending guardrails that discovers, negotiates, and executes purchases using PayPal's sandbox checkout APIs.

## The Story & Inspiration
Autonomous software development and operations agents are now capable of writing code, deploying infrastructure, and running data pipelines. However, granting agents payment capability has remained a major barrier. A single runaway prompt loop or prompt injection attack could drain bank accounts within minutes.

We built PayAgent to bridge this trust gap. By placing a programmatic guardrail between the LLM and the payment gateway, companies can safely equip AI workers with purchasing power.

## What It Does
1. **AdversarialShield & Shadow Simulation Box**: Intercepts prompt injections, instruction overrides, delimiter density attacks, and unverified crypto wallet redirects before any financial state is touched. Runs a dry-run pre-flight simulation before production checkout.
2. **Deterministic Guardrails Engine**: Evaluates purchase intents against single-transaction caps ($35), rolling 24h daily spend limits ($150), merchant whitelist categories, and vendor trust scores.
3. **Dual-Mode PayPal REST v2 Engine**: Seamlessly connects to `https://api-m.sandbox.paypal.com` with real OAuth2 Bearer token exchange, order creation (`/v2/checkout/orders`), item breakdown validation, and capture settlement.
4. **Human-in-the-Loop Escalation**: Flagged purchases above autonomous threshold ($25) pause execution and stage the order with a direct PayPal sandbox checkout URL for operator authorization.
5. **Cryptographic SHA-256 Audit Ledger**: Hash-chains every transaction into an immutable Merkle audit log with tamper-evident nonce verification and replay attack prevention.
6. **Live Telemetry & WebSocket Stepper**: Streams 5-stage pipeline reasoning in real-time to a sleek shadcn/ui zinc web console.

## How We Built It
- **Runtime**: Bun with native TypeScript compilation.
- **Payment Gateway**: PayPal Orders v2 REST API (`/v2/checkout/orders` & `/v2/checkout/orders/{id}/capture`) with OAuth2 client credentials grant.
- **Security & Hardening**:
  - `AdversarialShield`: Regex and semantic heuristic detector for instruction hijacking and wallet extraction.
  - `VelocityEngine`: Sliding-window burst attack and runaway agent execution loop throttler.
  - `SimulationBox`: Pre-flight sandbox testing suite.
  - `CryptographicAuditLedger`: SHA-256 hash-chained block records.
  - `PayPalWebhookEngine`: HMAC-SHA256 signature verification for asynchronous payment capture notifications.
- **Frontend**: Responsive stock shadcn/ui zinc dark theme with zero external bundle bloat, real-time WebSocket state synchronization, interactive policy sliders, and transaction inspector modal.
- **Testing**: 18/18 passing native tests covering guardrail limits, attack vectors, and live PayPal Sandbox integration.

## Challenges Overcome
- Zero Network Friction: Developed a simulation layer matching the PayPal Orders v2 response schema so tests and local development run reliably without network flakiness.
- Accurate Budget Rollover: Implemented date-based spend rollover tracking to prevent boundary exploitation across day transitions.
- Human-in-the-Loop Handshake: Balanced autonomy with safety by allowing orders within limits to settle instantly while holding larger orders in pending state until operator sign-off.

## Accomplishments
- 100% test pass rate across guardrail boundary conditions and PayPal integration tests.
- Zero external runtime dependencies beyond Bun and TypeScript.
- Clean separation between policy evaluation, payment execution, and audit logging.

## What Is Next
- Multi-token currency support with real-time foreign exchange conversion.
- Webhook receiver for asynchronous PayPal order capture callbacks.
- Browser extension for human operator authorization notifications.

## Open Source License
PayAgent is published under the permissive MIT License. Review `package.json` for license declaration.

---

## 2-Minute Video Demo Script

### Scene 1: The Problem (0:00 - 0:25)
- Visual: Split screen. On the left, an autonomous AI agent loop requesting compute resources. On the right, an unguarded corporate credit card getting drained.
- Speaker: "Autonomous AI agents can write software and deploy systems, but giving them money is terrifying. A single hallucination or injection attack can trigger thousands of dollars in unauthorized charges. Meet PayAgent: the open source safety protocol that equips autonomous agents with PayPal purchasing power under strict programmatic guardrails."

### Scene 2: The Guardrails Shield (0:25 - 0:55)
- Visual: Terminal running `bun test`. Test cases pass showing single-order budget checks, category whitelist verification, and daily spend limits.
- Speaker: "PayAgent inspects every purchase request before any network call. Our GuardrailsEngine validates four distinct layers: single order budget limits, 24-hour aggregate spend, merchant category whitelists, and vendor reputation scores. If an agent tries to buy from an unapproved vendor or exceeds its cap, the transaction is rejected instantly with an actionable risk score."

### Scene 3: PayPal Orders v2 Integration (0:55 - 1:25)
- Visual: Running `bun demo`. Terminal displays an approved $14.00 purchase for inference tokens. PayPal Orders v2 returns an order ID (`ORD-XXXX`), approval link, and captures settlement.
- Speaker: "For approved transactions, PayAgent communicates directly with the PayPal Orders v2 API. Here we see the agent requesting $14.00 of API tokens. The policy engine approves the transaction, creates the PayPal order, and captures settlement immediately, logging the completed capture ID to an immutable audit record."

### Scene 4: Human-in-the-Loop Escalation & Conclusion (1:25 - 2:00)
- Visual: Purchase for $30.00 triggered. Terminal shows status `APPROVED_MANUAL`, flagging human escalation with a PayPal checkout link.
- Speaker: "When a purchase crosses our human approval threshold, PayAgent pauses execution and escalates the transaction to a human supervisor with a one-click PayPal checkout URL. With PayAgent, agentic commerce is safe, auditable, and production ready. Built with TypeScript, Bun, and PayPal Orders v2."

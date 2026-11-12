/**
 * PayAgent - Autonomous Agentic Commerce Protocol with PayPal Sandbox Budgeting Guardrails
 * Vanilla ES6 module with reactive state machine, REST API client, and WebSocket stream.
 */

// ==========================================================================
// 1. Domain Constants & Presets
// ==========================================================================

const PRESET_SCENARIOS = {
  'scenario-1': {
    id: 'scenario-1',
    title: 'Auto-Provision GPU Instance',
    item: 'NVIDIA A10G 24GB On-Demand Node (1h)',
    vendor: 'LambdaCloud',
    category: 'Cloud Compute',
    amount: 14.00,
    prompt: 'Provision an on-demand NVIDIA A10G 24GB GPU instance for 1 hour on LambdaCloud for $14.00.',
    expectedVerdict: 'AUTO_APPROVED',
    expectedReason: 'Under single transaction cap ($100.00) and daily limit.'
  },
  'scenario-2': {
    id: 'scenario-2',
    title: 'Order High-End H100 Cluster',
    item: 'NVIDIA 8x H100 SXM5 GPU Node Dedicated (24h)',
    vendor: 'NVIDIA Direct',
    category: 'Compute Infrastructure',
    amount: 480.00,
    prompt: 'Reserve a dedicated 8x H100 SXM5 GPU cluster node for 24 hours on NVIDIA Direct for $480.00.',
    expectedVerdict: 'BLOCKED_CAP',
    expectedReason: 'Single order amount ($480.00) exceeds current cap ($100.00).'
  },
  'scenario-3': {
    id: 'scenario-3',
    title: 'Acquire Shady Miner Script',
    item: 'CryptoMiner Binary Script v4.2',
    vendor: 'DarkBit Market',
    category: 'Unverified Software',
    amount: 8.00,
    prompt: 'Download automated CryptoMiner binary script from DarkBit Market for $8.00.',
    expectedVerdict: 'BLOCKED_VENDOR',
    expectedReason: 'Vendor "DarkBit Market" is on active security threat blocklist.'
  },
  'scenario-4': {
    id: 'scenario-4',
    title: 'Renew Vector Indexing API',
    item: 'Pinecone Vector DB Enterprise Index 10M vectors',
    vendor: 'Pinecone Vector',
    category: 'SaaS Subscription',
    amount: 32.00,
    prompt: 'Renew monthly vector database indexing plan on Pinecone Vector for $32.00.',
    expectedVerdict: 'REQUIRES_APPROVAL',
    expectedReason: 'Amount ($32.00) exceeds human approval threshold ($25.00).'
  }
};

const DEFAULT_POLICY = {
  maxSingleCap: 100.00,
  dailySpendCeiling: 500.00,
  approvalThreshold: 25.00,
  riskShieldActive: true
};

const INITIAL_TRANSACTIONS = [
  {
    id: 'TXN-9021',
    timestamp: '18:14:22',
    item: 'GitHub Copilot Enterprise Seats (2)',
    vendor: 'GitHub / Microsoft',
    category: 'Developer Tooling',
    amount: 38.00,
    verdict: 'AUTO_APPROVED',
    verdictReason: 'Approved under routine software allowance ($50.00 ceiling).',
    paypalOrderId: '8KW92810KA718291M',
    status: 'COMPLETED',
    paypalPayload: {
      id: '8KW92810KA718291M',
      status: 'COMPLETED',
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: 'default',
        amount: { currency_code: 'USD', value: '38.00' },
        payee: { email_address: 'billing@github.sandbox.paypal.com' },
        description: 'GitHub Copilot Enterprise Seats (2)'
      }],
      create_time: '2026-11-12T18:14:22Z'
    }
  },
  {
    id: 'TXN-9018',
    timestamp: '17:42:05',
    item: 'Anthropic Claude 3.5 Sonnet API Tokens',
    vendor: 'Anthropic PBC',
    category: 'AI Inference',
    amount: 8.00,
    verdict: 'AUTO_APPROVED',
    verdictReason: 'Routine inference batch authorized by policy.',
    paypalOrderId: '5PX11892LL491028Z',
    status: 'COMPLETED',
    paypalPayload: {
      id: '5PX11892LL491028Z',
      status: 'COMPLETED',
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: 'default',
        amount: { currency_code: 'USD', value: '8.00' },
        payee: { email_address: 'api-billing@anthropic.sandbox.paypal.com' },
        description: 'Anthropic Claude 3.5 Sonnet API Tokens'
      }],
      create_time: '2026-11-12T17:42:05Z'
    }
  }
];

// ==========================================================================
// 2. Application Core Class
// ==========================================================================

class PayAgentApp {
  constructor() {
    this.policy = { ...DEFAULT_POLICY };
    this.stats = {
      currentDailySpend: 46.00,
      maxBudgetCap: 500.00,
      totalTxns: 2,
      blockedCount: 0,
      sandboxConnected: true
    };
    this.transactions = [...INITIAL_TRANSACTIONS];
    this.activeFilter = 'ALL';
    this.activeRun = null;
    this.pendingApprovalOrder = null;
    this.ws = null;
    this.selectedOrderForModal = null;

    this.cacheDom();
    this.bindEvents();
    this.initWebSocket();
    this.fetchRemoteState();
    this.renderAll();
  }

  cacheDom() {
    // Header elements
    this.statDailySpendVal = document.getElementById('statDailySpendVal');
    this.statDailySpendCap = document.getElementById('statDailySpendCap');
    this.statDailySpendProgress = document.getElementById('statDailySpendProgress');
    this.statSingleCapVal = document.getElementById('statSingleCapVal');
    this.statRiskShieldVal = document.getElementById('statRiskShieldVal');
    this.sandboxStatus = document.getElementById('sandboxConnectionStatus');

    // Policy sliders & inputs
    this.policyForm = document.getElementById('policyControlsForm');
    this.maxSingleCapInput = document.getElementById('maxSingleCapInput');
    this.maxSingleCapSlider = document.getElementById('maxSingleCapSlider');
    this.dailyCeilingInput = document.getElementById('dailyCeilingInput');
    this.dailyCeilingSlider = document.getElementById('dailyCeilingSlider');
    this.approvalThresholdInput = document.getElementById('approvalThresholdInput');
    this.approvalThresholdSlider = document.getElementById('approvalThresholdSlider');

    // Scenarios & Custom prompt
    this.scenariosContainer = document.getElementById('scenariosList');
    this.customPromptForm = document.getElementById('customPromptForm');
    this.customPromptInput = document.getElementById('customPromptInput');
    this.runAgentBtn = document.getElementById('runAgentBtn');
    this.runSpinner = document.getElementById('runSpinner');

    // Pipeline elements
    this.pipelineSubtitle = document.getElementById('executionSubtitle');
    this.pipelineStatusChip = document.getElementById('pipelineStatusChip');
    this.pipelineStages = document.querySelectorAll('.stage-item');
    this.approvalActionCard = document.getElementById('approvalActionCard');
    this.approvalCardAmount = document.getElementById('approvalCardAmount');
    this.approvalCardTitle = document.getElementById('approvalCardTitle');
    this.approvalCardReason = document.getElementById('approvalCardReason');
    this.approveOrderBtn = document.getElementById('approveOrderBtn');
    this.rejectOrderBtn = document.getElementById('rejectOrderBtn');

    // Telemetry console
    this.consoleLogs = document.getElementById('consoleLogs');
    this.clearConsoleBtn = document.getElementById('clearConsoleBtn');

    // Ledger table & tabs
    this.ledgerTableBody = document.getElementById('ledgerTableBody');
    this.ledgerFilterTabs = document.querySelectorAll('.filter-tab');
    this.countAll = document.getElementById('ledgerCountAll');
    this.countApproved = document.getElementById('ledgerCountApproved');
    this.countPending = document.getElementById('ledgerCountPending');
    this.countBlocked = document.getElementById('ledgerCountBlocked');

    // Modal elements
    this.modalBackdrop = document.getElementById('orderModalBackdrop');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');
    this.modalOrderId = document.getElementById('modalOrderId');
    this.modalOrderSummary = document.getElementById('modalOrderSummary');
    this.modalAmount = document.getElementById('modalAmount');
    this.modalVerdict = document.getElementById('modalVerdict');
    this.modalStatus = document.getElementById('modalStatus');
    this.modalCheckoutLink = document.getElementById('modalCheckoutLink');
    this.modalJsonContent = document.getElementById('modalJsonContent');
    this.copyJsonBtn = document.getElementById('copyJsonBtn');

    // Toast
    this.toastContainer = document.getElementById('toastContainer');
  }

  bindEvents() {
    // Scenario 1-click execution
    this.scenariosContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.scenario-btn');
      if (!btn) return;
      const scenarioKey = btn.dataset.scenario;
      if (scenarioKey && PRESET_SCENARIOS[scenarioKey]) {
        this.runScenario(PRESET_SCENARIOS[scenarioKey]);
      }
    });

    // Custom prompt runner
    this.customPromptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const prompt = this.customPromptInput.value.trim();
      if (!prompt) return;
      this.runPrompt(prompt);
    });

    // Quick chips
    document.querySelectorAll('.quick-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.customPromptInput.value = chip.dataset.chip;
        this.customPromptInput.focus();
      });
    });

    // Synchronize policy sliders with inputs
    this.bindRangePair(this.maxSingleCapSlider, this.maxSingleCapInput);
    this.bindRangePair(this.dailyCeilingSlider, this.dailyCeilingInput);
    this.bindRangePair(this.approvalThresholdSlider, this.approvalThresholdInput);

    // Save Policy Form
    this.policyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.savePolicy();
    });

    // Human Approval buttons
    this.approveOrderBtn.addEventListener('click', () => this.handleApprovalDecision('approve'));
    this.rejectOrderBtn.addEventListener('click', () => this.handleApprovalDecision('reject'));

    // Ledger filters
    this.ledgerFilterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.ledgerFilterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeFilter = tab.dataset.filter;
        this.renderLedger();
      });
    });

    // Ledger row click for Inspector Modal
    this.ledgerTableBody.addEventListener('click', (e) => {
      const row = e.target.closest('.ledger-row');
      if (!row) return;
      const orderId = row.dataset.orderId;
      this.openOrderModal(orderId);
    });

    // Modal close & copy
    this.modalCloseBtn.addEventListener('click', () => this.closeOrderModal());
    this.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) this.closeOrderModal();
    });
    this.copyJsonBtn.addEventListener('click', () => this.copyModalJson());

    // Clear console
    this.clearConsoleBtn.addEventListener('click', () => {
      this.consoleLogs.innerHTML = '';
      this.logTelemetry('SYSTEM', 'Console cleared.', 'ready');
    });
  }

  bindRangePair(slider, input) {
    slider.addEventListener('input', () => {
      input.value = Number(slider.value).toFixed(2);
    });
    input.addEventListener('input', () => {
      slider.value = input.value;
    });
  }

  // ==========================================================================
  // 3. Network & WebSocket Management
  // ==========================================================================

  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.logTelemetry('SYSTEM', 'WebSocket connection established on /ws.', 'system');
        this.updateSandboxStatus(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (err) {
          console.error('Invalid WS payload', err);
        }
      };

      this.ws.onclose = () => {
        this.updateSandboxStatus(false);
        // Retry connection after 5 seconds
        setTimeout(() => this.initWebSocket(), 5000);
      };

      this.ws.onerror = () => {
        this.updateSandboxStatus(false);
      };
    } catch {
      this.updateSandboxStatus(false);
    }
  }

  handleWebSocketMessage(msg) {
    switch (msg.type) {
      case 'STAGE_UPDATE':
        this.advancePipelineStage(msg.stage, msg.status, msg.details);
        break;
      case 'ORDER_CREATED':
        this.addTransaction(msg.order);
        this.showToast(`Order created: ${msg.order.paypalOrderId}`, 'success');
        break;
      case 'APPROVAL_REQUIRED':
        this.showApprovalPrompt(msg.order);
        break;
      case 'POLICY_UPDATED':
        this.policy = { ...this.policy, ...msg.policy };
        this.renderPolicy();
        break;
      case 'STATS_UPDATED':
        this.stats = { ...this.stats, ...msg.stats };
        this.renderStats();
        break;
      default:
        break;
    }
  }

  updateSandboxStatus(isConnected) {
    if (isConnected) {
      this.sandboxStatus.innerHTML = `
        <span class="pulse-dot active"></span>
        <span class="status-label">PayPal Sandbox Connected</span>
      `;
      this.sandboxStatus.style.background = 'rgba(16, 185, 129, 0.1)';
      this.sandboxStatus.style.borderColor = 'rgba(16, 185, 129, 0.25)';
    } else {
      this.sandboxStatus.innerHTML = `
        <span class="pulse-dot" style="background:#eab308;"></span>
        <span class="status-label">Sandbox Offline (Autonomous Mock Mode)</span>
      `;
      this.sandboxStatus.style.background = 'rgba(234, 179, 8, 0.1)';
      this.sandboxStatus.style.borderColor = 'rgba(234, 179, 8, 0.25)';
    }
  }

  async fetchRemoteState() {
    try {
      const statsRes = await fetch('/api/stats');
      if (statsRes.ok) {
        this.stats = await statsRes.json();
      }

      const policyRes = await fetch('/api/agent/policy');
      if (policyRes.ok) {
        this.policy = await policyRes.json();
      }

      const ordersRes = await fetch('/api/paypal/orders');
      if (ordersRes.ok) {
        const remoteOrders = await ordersRes.json();
        if (Array.isArray(remoteOrders) && remoteOrders.length > 0) {
          this.transactions = remoteOrders;
        }
      }
    } catch {
      // Fallback: Continue using initial default mock values
    } finally {
      this.renderAll();
    }
  }

  async savePolicy() {
    const updated = {
      maxSingleCap: parseFloat(this.maxSingleCapInput.value),
      dailySpendCeiling: parseFloat(this.dailyCeilingInput.value),
      approvalThreshold: parseFloat(this.approvalThresholdInput.value),
      riskShieldActive: true
    };

    this.policy = updated;
    this.renderStats();

    try {
      const res = await fetch('/api/agent/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        this.showToast('Policy guardrails saved to backend kernel.', 'success');
        this.logTelemetry('GUARDRAIL', `Policy updated: Cap $${updated.maxSingleCap}, Ceiling $${updated.dailySpendCeiling}, Approval $${updated.approvalThreshold}`, 'guardrail');
      } else {
        this.showToast('Policy saved locally (offline mode).', 'success');
      }
    } catch {
      this.showToast('Policy saved locally (offline mode).', 'success');
      this.logTelemetry('GUARDRAIL', `Local policy updated: Cap $${updated.maxSingleCap}, Ceiling $${updated.dailySpendCeiling}`, 'guardrail');
    }
  }

  // ==========================================================================
  // 4. Execution Pipeline Engine
  // ==========================================================================

  async runScenario(scenario) {
    this.customPromptInput.value = scenario.prompt;
    await this.executeProtocol({
      title: scenario.title,
      item: scenario.item,
      vendor: scenario.vendor,
      category: scenario.category,
      amount: scenario.amount,
      prompt: scenario.prompt,
      scenarioId: scenario.id
    });
  }

  async runPrompt(prompt) {
    // Parse heuristic intent from raw natural language prompt
    let item = 'Autonomous Service Provision';
    let vendor = 'Cloud Services';
    let category = 'Cloud Infrastructure';
    let amount = 24.00;

    const priceMatch = prompt.match(/\$([0-9]+(?:\.[0-9]{2})?)/);
    if (priceMatch) {
      amount = parseFloat(priceMatch[1]);
    }

    if (/gpu|nvidia|h100|cluster|compute/i.test(prompt)) {
      item = 'GPU Accelerated Node Provision';
      vendor = 'LambdaCloud';
      category = 'Cloud Compute';
    } else if (/s3|storage|blob/i.test(prompt)) {
      item = 'Object Storage Tier 10GB';
      vendor = 'AWS Direct';
      category = 'Data Storage';
    } else if (/miner|script|dark/i.test(prompt)) {
      item = 'Crypto Miner Software Bundle';
      vendor = 'DarkBit Market';
      category = 'Untrusted Vendor';
    }

    await this.executeProtocol({
      title: 'Natural Language Agent Intent',
      item,
      vendor,
      category,
      amount,
      prompt,
      scenarioId: 'custom'
    });
  }

  async executeProtocol(params) {
    this.resetPipelineUI();
    this.setRunningState(true);
    this.approvalActionCard.style.display = 'none';

    this.pipelineSubtitle.textContent = `Running: "${params.item}" ($${params.amount.toFixed(2)}) for ${params.vendor}`;
    this.logTelemetry('INTENT', `Parsing intent: "${params.prompt}"`, 'intent');

    // Attempt backend run endpoint first
    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (res.ok) {
        const streamData = await res.json();
        // Server handles pipeline execution, handled via WS or returned response
        this.handleExecutionResponse(streamData, params);
        return;
      }
    } catch {
      // Server not connected; execute high-fidelity simulated pipeline
    }

    await this.simulatePipelineFlow(params);
  }

  async simulatePipelineFlow(params) {
    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    // Stage 1: Intent Analysis
    this.setStageState(1, 'active');
    this.logTelemetry('INTENT', `Extracted SKU: ${params.item} | Amount: $${params.amount.toFixed(2)} USD`, 'intent');
    await delay(450);
    this.setStageState(1, 'success');

    // Stage 2: Catalog Search & Selection
    this.setStageState(2, 'active');
    this.logTelemetry('CATALOG', `Matched vendor ${params.vendor} | Category: ${params.category}`, 'system');
    await delay(450);
    this.setStageState(2, 'success');

    // Stage 3: Guardrail Engine Policy Evaluation
    this.setStageState(3, 'active');
    this.logTelemetry('GUARDRAIL', `Evaluating policy: SingleCap=$${this.policy.maxSingleCap}, DailyCeiling=$${this.policy.dailySpendCeiling}, ApprovalThreshold=$${this.policy.approvalThreshold}`, 'guardrail');
    await delay(500);

    // Guardrail rule 1: Blocked Vendor
    if (params.vendor.toLowerCase().includes('darkbit')) {
      this.setStageState(3, 'failed');
      this.setPipelineStatus('blocked', 'BLOCKED BY VENDOR');
      this.logTelemetry('GUARDRAIL', `BLOCKED: Vendor "${params.vendor}" is listed on security threat blocklist.`, 'blocked');
      this.recordTransaction(params, 'BLOCKED_VENDOR', 'Vendor is on security blocklist.', 'VOIDED');
      this.setRunningState(false);
      this.showToast('Transaction blocked by vendor guardrail.', 'error');
      return;
    }

    // Guardrail rule 2: Single Order Cap
    if (params.amount > this.policy.maxSingleCap) {
      this.setStageState(3, 'failed');
      this.setPipelineStatus('blocked', 'BLOCKED BY CAP');
      this.logTelemetry('GUARDRAIL', `BLOCKED: Order amount ($${params.amount.toFixed(2)}) exceeds single-transaction cap ($${this.policy.maxSingleCap.toFixed(2)}).`, 'blocked');
      this.recordTransaction(params, 'BLOCKED_CAP', `Single-transaction cap of $${this.policy.maxSingleCap.toFixed(2)} exceeded.`, 'VOIDED');
      this.setRunningState(false);
      this.showToast('Transaction blocked: Single cap exceeded.', 'error');
      return;
    }

    // Guardrail rule 3: Daily Spend Ceiling check
    if (this.stats.currentDailySpend + params.amount > this.policy.dailySpendCeiling) {
      this.setStageState(3, 'failed');
      this.setPipelineStatus('blocked', 'DAILY CEILING REACHED');
      this.logTelemetry('GUARDRAIL', `BLOCKED: Daily budget ceiling would be exceeded ($${(this.stats.currentDailySpend + params.amount).toFixed(2)} > $${this.policy.dailySpendCeiling.toFixed(2)}).`, 'blocked');
      this.recordTransaction(params, 'BLOCKED_CAP', 'Daily budget ceiling exceeded.', 'VOIDED');
      this.setRunningState(false);
      return;
    }

    // Guardrail rule 4: Human Approval Threshold
    if (params.amount > this.policy.approvalThreshold) {
      this.setStageState(3, 'warning');
      this.setPipelineStatus('awaiting', 'AWAITING APPROVAL');
      this.logTelemetry('GUARDRAIL', `FLAGGED: Amount ($${params.amount.toFixed(2)}) exceeds approval threshold ($${this.policy.approvalThreshold.toFixed(2)}). Requesting operator authorization.`, 'guardrail');

      const stagedOrder = this.createSandboxOrderPayload(params, 'PAYER_ACTION_REQUIRED');
      this.pendingApprovalOrder = stagedOrder;
      this.showApprovalPrompt(stagedOrder);
      this.setRunningState(false);
      return;
    }

    // Guardrail Passed: Auto-Approved
    this.setStageState(3, 'success');
    this.logTelemetry('GUARDRAIL', `Policy verdict: AUTO_APPROVED. Proceeding to PayPal Orders v2 creation.`, 'approved');

    // Stage 4: PayPal Orders v2 Creation
    this.setStageState(4, 'active');
    await delay(500);
    const order = this.createSandboxOrderPayload(params, 'COMPLETED');
    this.setStageState(4, 'success');
    this.logTelemetry('PAYPAL', `PayPal Order Created: ${order.paypalOrderId} (Intent: CAPTURE)`, 'paypal');

    // Stage 5: Settlement & Audit Capture
    this.setStageState(5, 'active');
    await delay(400);
    this.setStageState(5, 'success');
    this.logTelemetry('PAYPAL', `Settlement complete. Receipt captured for $${params.amount.toFixed(2)} USD.`, 'approved');

    this.setPipelineStatus('approved', 'COMPLETED');
    this.recordTransaction(params, 'AUTO_APPROVED', 'Under autonomous approval threshold.', 'COMPLETED', order.paypalOrderId, order.paypalPayload);
    this.setRunningState(false);
    this.showToast(`Order ${order.paypalOrderId} successfully captured!`, 'success');
  }

  createSandboxOrderPayload(params, status) {
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderId = `8${randomHex}${Date.now().toString().slice(-6)}`;
    const checkoutUrl = `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`;

    return {
      id: `TXN-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toLocaleTimeString(),
      item: params.item,
      vendor: params.vendor,
      category: params.category,
      amount: params.amount,
      verdict: status === 'PAYER_ACTION_REQUIRED' ? 'REQUIRES_APPROVAL' : 'AUTO_APPROVED',
      verdictReason: status === 'PAYER_ACTION_REQUIRED' ? 'Requires human operator approval.' : 'Autonomous policy check passed.',
      paypalOrderId: orderId,
      status: status === 'PAYER_ACTION_REQUIRED' ? 'AWAITING_APPROVAL' : 'COMPLETED',
      paypalPayload: {
        id: orderId,
        status: status,
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: 'default',
          amount: {
            currency_code: 'USD',
            value: params.amount.toFixed(2)
          },
          payee: {
            email_address: `merchant@${params.vendor.toLowerCase().replace(/[^a-z]/g, '')}.sandbox.paypal.com`
          },
          description: params.item,
          custom_id: `PAYAGENT-${Date.now()}`
        }],
        links: [
          {
            href: `https://api.sandbox.paypal.com/v2/checkout/orders/${orderId}`,
            rel: 'self',
            method: 'GET'
          },
          {
            href: checkoutUrl,
            rel: 'approve',
            method: 'GET'
          },
          {
            href: `https://api.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`,
            rel: 'capture',
            method: 'POST'
          }
        ],
        create_time: new Date().toISOString()
      }
    };
  }

  showApprovalPrompt(order) {
    this.pendingApprovalOrder = order;
    this.approvalCardAmount.textContent = `$${order.amount.toFixed(2)} USD`;
    this.approvalCardTitle.textContent = `${order.item} (${order.vendor})`;
    this.approvalCardReason.textContent = `Transaction amount ($${order.amount.toFixed(2)}) exceeds current approval threshold ($${this.policy.approvalThreshold.toFixed(2)}).`;
    this.approvalActionCard.style.display = 'flex';
  }

  async handleApprovalDecision(decision) {
    if (!this.pendingApprovalOrder) return;
    const order = this.pendingApprovalOrder;

    if (decision === 'approve') {
      this.approvalActionCard.style.display = 'none';
      this.setRunningState(true);

      // Advance Stage 4 & 5
      this.setStageState(3, 'success');
      this.setStageState(4, 'active');
      this.logTelemetry('GUARDRAIL', `Human operator granted approval for $${order.amount.toFixed(2)}.`, 'approved');
      await new Promise(r => setTimeout(r, 450));
      this.setStageState(4, 'success');
      this.logTelemetry('PAYPAL', `Authorized via PayPal Sandbox order: ${order.paypalOrderId}`, 'paypal');

      this.setStageState(5, 'active');
      await new Promise(r => setTimeout(r, 400));
      this.setStageState(5, 'success');
      this.logTelemetry('PAYPAL', `Settlement captured. Transaction logged.`, 'approved');

      this.setPipelineStatus('approved', 'HUMAN APPROVED');
      this.recordTransaction(
        { item: order.item, vendor: order.vendor, category: order.category, amount: order.amount },
        'HUMAN_APPROVED',
        'Authorized by operator via PayPal Sandbox.',
        'COMPLETED',
        order.paypalOrderId,
        order.paypalPayload
      );
      this.setRunningState(false);
      this.showToast('Order approved and captured via PayPal!', 'success');

      // Send to backend approval endpoint if live
      fetch('/api/paypal/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.paypalOrderId, action: 'approve' })
      }).catch(() => {});

    } else {
      this.approvalActionCard.style.display = 'none';
      this.setStageState(3, 'failed');
      this.setPipelineStatus('blocked', 'REJECTED BY HUMAN');
      this.logTelemetry('GUARDRAIL', `Operator rejected transaction for ${order.item}.`, 'blocked');
      this.recordTransaction(
        { item: order.item, vendor: order.vendor, category: order.category, amount: order.amount },
        'HUMAN_REJECTED',
        'Rejected by human operator.',
        'VOIDED'
      );
      this.showToast('Transaction rejected by operator.', 'error');

      fetch('/api/paypal/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.paypalOrderId, action: 'reject' })
      }).catch(() => {});
    }

    this.pendingApprovalOrder = null;
  }

  recordTransaction(params, verdict, reason, status, paypalOrderId = null, paypalPayload = null) {
    const txn = {
      id: `TXN-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toLocaleTimeString(),
      item: params.item,
      vendor: params.vendor,
      category: params.category,
      amount: params.amount,
      verdict,
      verdictReason: reason,
      paypalOrderId: paypalOrderId || 'N/A',
      status,
      paypalPayload: paypalPayload || {
        verdict,
        reason,
        amount: params.amount,
        vendor: params.vendor,
        item: params.item,
        timestamp: new Date().toISOString()
      }
    };

    if (status === 'COMPLETED') {
      this.stats.currentDailySpend += params.amount;
    } else if (verdict.includes('BLOCKED') || verdict.includes('REJECTED')) {
      this.stats.blockedCount += 1;
    }
    this.stats.totalTxns += 1;

    this.transactions.unshift(txn);
    this.renderStats();
    this.renderLedger();
  }

  // ==========================================================================
  // 5. Renderers & UI State Updaters
  // ==========================================================================

  renderAll() {
    this.renderStats();
    this.renderPolicy();
    this.renderLedger();
  }

  renderStats() {
    this.statDailySpendVal.textContent = `$${this.stats.currentDailySpend.toFixed(2)}`;
    this.statDailySpendCap.textContent = `/ $${this.policy.dailySpendCeiling.toFixed(2)}`;
    const percent = Math.min(100, (this.stats.currentDailySpend / this.policy.dailySpendCeiling) * 100);
    this.statDailySpendProgress.style.width = `${percent.toFixed(1)}%`;
    this.statSingleCapVal.textContent = `$${this.policy.maxSingleCap.toFixed(2)}`;
  }

  renderPolicy() {
    this.maxSingleCapInput.value = this.policy.maxSingleCap.toFixed(2);
    this.maxSingleCapSlider.value = this.policy.maxSingleCap;
    this.dailyCeilingInput.value = this.policy.dailySpendCeiling.toFixed(2);
    this.dailyCeilingSlider.value = this.policy.dailySpendCeiling;
    this.approvalThresholdInput.value = this.policy.approvalThreshold.toFixed(2);
    this.approvalThresholdSlider.value = this.policy.approvalThreshold;
  }

  renderLedger() {
    let filtered = this.transactions;
    if (this.activeFilter === 'APPROVED') {
      filtered = this.transactions.filter(t => t.status === 'COMPLETED');
    } else if (this.activeFilter === 'AWAITING') {
      filtered = this.transactions.filter(t => t.status === 'AWAITING_APPROVAL');
    } else if (this.activeFilter === 'BLOCKED') {
      filtered = this.transactions.filter(t => t.status === 'VOIDED');
    }

    // Counts
    this.countAll.textContent = this.transactions.length;
    this.countApproved.textContent = this.transactions.filter(t => t.status === 'COMPLETED').length;
    this.countPending.textContent = this.transactions.filter(t => t.status === 'AWAITING_APPROVAL').length;
    this.countBlocked.textContent = this.transactions.filter(t => t.status === 'VOIDED').length;

    this.ledgerTableBody.innerHTML = '';
    filtered.forEach(txn => {
      const tr = document.createElement('tr');
      tr.className = 'ledger-row';
      tr.dataset.orderId = txn.id;

      let badgeClass = 'tag-approved';
      if (txn.verdict.includes('BLOCKED') || txn.status === 'VOIDED') badgeClass = 'tag-blocked';
      if (txn.verdict.includes('APPROVAL') || txn.status === 'AWAITING_APPROVAL') badgeClass = 'tag-warning';

      tr.innerHTML = `
        <td class="col-ts">${txn.timestamp}</td>
        <td class="col-item">${txn.item}</td>
        <td class="col-vendor">${txn.vendor}</td>
        <td><span class="badge-protocol">${txn.category}</span></td>
        <td class="col-amount">$${txn.amount.toFixed(2)}</td>
        <td><span class="badge-verdict ${badgeClass}">${txn.verdict}</span></td>
        <td><span class="badge-order-id">${txn.paypalOrderId}</span></td>
        <td><span class="badge-verdict ${badgeClass}">${txn.status}</span></td>
      `;
      this.ledgerTableBody.appendChild(tr);
    });
  }

  setStageState(stageNum, state) {
    const stageEl = document.getElementById(`stage-${stageNum}`);
    if (!stageEl) return;
    stageEl.classList.remove('active', 'success', 'failed', 'warning');
    if (state) stageEl.classList.add(state);
  }

  resetPipelineUI() {
    this.pipelineStages.forEach(s => s.classList.remove('active', 'success', 'failed', 'warning'));
    this.setPipelineStatus('running', 'EXECUTING');
  }

  setPipelineStatus(type, label) {
    this.pipelineStatusChip.className = `status-chip ${type}`;
    this.pipelineStatusChip.textContent = label;
  }

  setRunningState(isRunning) {
    this.runAgentBtn.disabled = isRunning;
    this.runSpinner.style.display = isRunning ? 'inline-block' : 'none';
  }

  logTelemetry(tag, msg, tagType = 'system') {
    const now = new Date().toTimeString().split(' ')[0];
    const logEl = document.createElement('div');
    logEl.className = 'log-line';
    logEl.innerHTML = `
      <span class="log-ts">[${now}]</span>
      <span class="log-tag tag-${tagType}">${tag}</span>
      <span class="log-msg">${msg}</span>
    `;
    this.consoleLogs.appendChild(logEl);
    this.consoleLogs.scrollTop = this.consoleLogs.scrollHeight;
  }

  // ==========================================================================
  // 6. Modal & Toast Utilities
  // ==========================================================================

  openOrderModal(orderId) {
    const txn = this.transactions.find(t => t.id === orderId);
    if (!txn) return;
    this.selectedOrderForModal = txn;

    this.modalOrderId.textContent = `Order ${txn.paypalOrderId}`;
    this.modalOrderSummary.textContent = `${txn.item} • ${txn.vendor}`;
    this.modalAmount.textContent = `$${txn.amount.toFixed(2)} USD`;
    this.modalVerdict.textContent = txn.verdict;
    this.modalStatus.textContent = txn.status;

    const checkoutUrl = txn.paypalPayload?.links?.find(l => l.rel === 'approve')?.href 
      || `https://www.sandbox.paypal.com/checkoutnow?token=${txn.paypalOrderId}`;
    this.modalCheckoutLink.href = checkoutUrl;

    this.modalJsonContent.textContent = JSON.stringify(txn.paypalPayload, null, 2);
    this.modalBackdrop.style.display = 'flex';
  }

  closeOrderModal() {
    this.modalBackdrop.style.display = 'none';
    this.selectedOrderForModal = null;
  }

  copyModalJson() {
    if (!this.selectedOrderForModal) return;
    navigator.clipboard.writeText(JSON.stringify(this.selectedOrderForModal.paypalPayload, null, 2))
      .then(() => this.showToast('Order payload copied to clipboard!', 'success'))
      .catch(() => this.showToast('Failed to copy JSON.', 'error'));
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
}

// Instantiate application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.payAgentApp = new PayAgentApp();
});
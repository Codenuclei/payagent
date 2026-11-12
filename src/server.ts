import { join } from "path";
import type { ServerWebSocket } from "bun";
import { CommerceAgent, DEMO_SCENARIOS, type StepEvent } from "./agent/engine";
import { MARKETPLACE_CATALOG } from "./agent/marketplace";
import type { GuardrailPolicy } from "./agent/guardrails";

const PORT = Number(process.env.PORT || 3456);
const PUBLIC_DIR = join(import.meta.dir, "..", "public");

const agent = new CommerceAgent();
const activeSockets = new Set<ServerWebSocket<{ id: string }>>();

agent.onEvent((event: StepEvent) => {
  const payload = JSON.stringify({ type: "STEP_EVENT", data: event });
  for (const ws of activeSockets) {
    try {
      ws.send(payload);
    } catch {
      activeSockets.delete(ws);
    }
  }
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function corsOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

const server = Bun.serve<{ id: string }>({
  port: PORT,
  async fetch(req, serverInstance) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return corsOptionsResponse();
    }

    if (url.pathname === "/ws") {
      const upgraded = serverInstance.upgrade(req, {
        data: { id: Math.random().toString(36).substring(2, 9) },
      });
      if (upgraded) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // REST API Routes
    if (url.pathname === "/api/agent/run" && req.method === "POST") {
      try {
        const body = (await req.json()) as { prompt?: string; scenarioId?: string; dryRunSimulationOnly?: boolean };
        const result = await agent.run(body);
        return jsonResponse(result);
      } catch (err: any) {
        return jsonResponse({ error: err?.message || "Execution error" }, 500);
      }
    }

    if (url.pathname === "/api/simulation/preflight" && req.method === "POST") {
      try {
        const body = (await req.json()) as { prompt: string; itemId?: string };
        const report = await agent.getSimulationBox().runPreflight(body.prompt, body.itemId);
        return jsonResponse(report);
      } catch (err: any) {
        return jsonResponse({ error: err?.message || "Simulation preflight error" }, 500);
      }
    }

    if (url.pathname === "/api/agent/policy" && req.method === "GET") {
      return jsonResponse(agent.getPolicy());
    }

    if (url.pathname === "/api/agent/policy" && req.method === "POST") {
      try {
        const body = (await req.json()) as Partial<GuardrailPolicy>;
        agent.updatePolicy(body);
        return jsonResponse({ success: true, policy: agent.getPolicy() });
      } catch (err: any) {
        return jsonResponse({ error: err?.message || "Invalid policy payload" }, 400);
      }
    }

    if (url.pathname === "/api/paypal/credentials" && req.method === "GET") {
      return jsonResponse({
        hasCredentials: agent.getPayPalClient().hasCredentials,
        simulationMode: agent.getPayPalClient().simulationMode,
        targetEndpoint: "https://api-m.sandbox.paypal.com",
      });
    }

    if (url.pathname === "/api/paypal/credentials" && req.method === "POST") {
      try {
        const body = (await req.json()) as { clientId: string; clientSecret: string };
        agent.getPayPalClient().setCredentials(body.clientId, body.clientSecret);
        const connectionTest = await agent.getPayPalClient().testLiveConnection();
        return jsonResponse({
          success: true,
          connectionTest,
          simulationMode: agent.getPayPalClient().simulationMode,
        });
      } catch (err: any) {
        return jsonResponse({ error: err?.message || "Failed to update PayPal credentials" }, 400);
      }
    }

    if (url.pathname === "/api/paypal/test-connection" && req.method === "POST") {
      const result = await agent.getPayPalClient().testLiveConnection();
      return jsonResponse(result);
    }

    if (url.pathname === "/api/paypal/orders" && req.method === "GET") {
      return jsonResponse({
        orders: agent.getTransactions(),
        pending: agent.getPendingApprovals(),
      });
    }

    if (url.pathname === "/api/paypal/approve" && req.method === "POST") {
      try {
        const body = (await req.json()) as { orderId: string };
        if (!body.orderId) {
          return jsonResponse({ error: "Missing required orderId" }, 400);
        }
        const settledTx = await agent.approveOrder(body.orderId);
        return jsonResponse({ success: true, transaction: settledTx });
      } catch (err: any) {
        return jsonResponse({ error: err?.message || "Approval failed" }, 400);
      }
    }

    if (url.pathname === "/api/ledger/blocks" && req.method === "GET") {
      return jsonResponse({
        blocks: agent.getAuditLedger().getChain(),
        verification: agent.getAuditLedger().verifyIntegrity(),
      });
    }

    if (url.pathname === "/api/ledger/verify" && req.method === "POST") {
      return jsonResponse(agent.getAuditLedger().verifyIntegrity());
    }

    if (url.pathname === "/api/devmode" && req.method === "GET") {
      return jsonResponse({
        devMode: agent.getDevMode(),
        environment: agent.getSimulationBox().getEnvironment(),
      });
    }

    if (url.pathname === "/api/devmode" && req.method === "POST") {
      try {
        const body = (await req.json()) as { devMode?: boolean; environment?: any };
        if (body.devMode !== undefined) agent.setDevMode(body.devMode);
        if (body.environment) agent.getSimulationBox().setEnvironment(body.environment);
        return jsonResponse({
          success: true,
          devMode: agent.getDevMode(),
          environment: agent.getSimulationBox().getEnvironment(),
        });
      } catch (err: any) {
        return jsonResponse({ error: err?.message || "Failed to update devmode" }, 400);
      }
    }

    if (url.pathname === "/api/stats" && req.method === "GET") {
      return jsonResponse(agent.getStats());
    }

    if (url.pathname === "/api/scenarios" && req.method === "GET") {
      return jsonResponse(DEMO_SCENARIOS);
    }

    if (url.pathname === "/api/marketplace" && req.method === "GET") {
      return jsonResponse(MARKETPLACE_CATALOG);
    }

    // Static asset serving from public directory
    let filePath = join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
    let file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  },

  websocket: {
    open(ws) {
      activeSockets.add(ws);
      ws.send(
        JSON.stringify({
          type: "CONNECTED",
          message: "Connected to PayAgent Hardened Telemetry Stream (DevMode: ON, SimulationBox: ACTIVE)",
        })
      );
    },
    message(ws, message) {
      try {
        const parsed = JSON.parse(String(message));
        if (parsed.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
      } catch {}
    },
    close(ws) {
      activeSockets.delete(ws);
    },
  },
});

console.log(`[PayAgent] Hardened Server listening on http://localhost:${server.port}`);

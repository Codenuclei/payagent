import { describe, it, expect } from "bun:test";
import { PayPalClient } from "../src/paypal/client";
import type { CreateOrderRequest } from "../src/paypal/types";

describe("PayPalClient Sandbox and Simulation Integration", () => {
  it("initializes in simulation mode when credentials are explicitly empty", () => {
    const client = new PayPalClient({ clientId: "", clientSecret: "" });
    expect(client.simulationMode).toBe(true);
  });

  it("creates an order in simulation mode with mock approval links", async () => {
    const simClient = new PayPalClient({ clientId: "", clientSecret: "" });
    const orderRequest: CreateOrderRequest = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "PU-SIM-001",
          description: "Simulation Token Refill",
          amount: { currency_code: "USD", value: "14.00" },
        },
      ],
    };

    const order = await simClient.createOrder(orderRequest);
    expect(order.id).toBeDefined();
    expect(order.id.startsWith("ORD-")).toBe(true);
    expect(order.status).toBe("CREATED");
    expect(order.links.some((l) => l.rel === "approve")).toBe(true);
  });

  it("captures an order in simulation mode and confirms COMPLETED settlement", async () => {
    const simClient = new PayPalClient({ clientId: "", clientSecret: "" });
    const orderRequest: CreateOrderRequest = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "PU-SIM-CAPTURE",
          amount: { currency_code: "USD", value: "14.00" },
        },
      ],
    };

    const order = await simClient.createOrder(orderRequest);
    const captured = await simClient.captureOrder(order.id);
    expect(captured.status).toBe("COMPLETED");
  });

  it("connects to live PayPal Sandbox and generates real order when credentials exist", async () => {
    const liveClient = new PayPalClient();
    if (!liveClient.hasCredentials) {
      console.log("Skipping live PayPal test: no credentials configured.");
      return;
    }

    const testResult = await liveClient.testLiveConnection();
    expect(testResult.connected).toBe(true);
    expect(testResult.mode).toBe("LIVE_SANDBOX");

    const order = await liveClient.createOrder({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "PU-LIVE-TEST",
          amount: {
            currency_code: "USD",
            value: "14.00",
            breakdown: {
              item_total: { currency_code: "USD", value: "14.00" },
            },
          },
          items: [
            {
              name: "LambdaCloud A10G GPU",
              unit_amount: { currency_code: "USD", value: "14.00" },
              quantity: "1",
              category: "DIGITAL_GOODS",
            },
          ],
        },
      ],
    });

    expect(order.id).toBeDefined();
    expect(order.status).toBe("CREATED");
    const approveLink = order.links.find((l) => l.rel === "approve");
    expect(approveLink).toBeDefined();
    expect(approveLink?.href).toContain("sandbox.paypal.com");
  });
});

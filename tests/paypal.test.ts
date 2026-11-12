import { describe, it, expect } from "bun:test";
import { PayPalClient } from "../src/paypal/client";
import type { CreateOrderRequest } from "../src/paypal/types";

describe("PayPalClient Sandbox and Simulation Integration", () => {
  it("initializes in simulation mode when credentials are absent", () => {
    const client = new PayPalClient({ clientId: "", clientSecret: "" });
    expect(client.simulationMode).toBe(true);
  });

  it("creates an order and returns valid PayPal Order structure with approval link", async () => {
    const client = new PayPalClient();
    const orderRequest: CreateOrderRequest = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "PU-TEST-001",
          description: "Anthropic Claude API Inference Token Refill",
          amount: {
            currency_code: "USD",
            value: "14.00",
          },
        },
      ],
    };

    const order = await client.createOrder(orderRequest);

    expect(order.id).toBeDefined();
    expect(order.id.startsWith("ORD-")).toBe(true);
    expect(order.status).toBe("CREATED");
    expect(order.intent).toBe("CAPTURE");
    expect(order.create_time).toBeDefined();

    expect(Array.isArray(order.links)).toBe(true);
    expect(order.links.length).toBeGreaterThanOrEqual(3);

    const approveLink = order.links.find((l) => l.rel === "approve");
    const selfLink = order.links.find((l) => l.rel === "self");
    const captureLink = order.links.find((l) => l.rel === "capture");

    expect(approveLink).toBeDefined();
    expect(approveLink?.href).toContain(order.id);
    expect(approveLink?.method).toBe("GET");

    expect(selfLink).toBeDefined();
    expect(selfLink?.href).toContain(order.id);

    expect(captureLink).toBeDefined();
    expect(captureLink?.method).toBe("POST");

    expect(order.purchase_units.length).toBe(1);
    expect(order.purchase_units[0].reference_id).toBe("PU-TEST-001");
    expect(order.purchase_units[0].amount.value).toBe("14.00");
    expect(order.purchase_units[0].amount.currency_code).toBe("USD");
    expect(order.purchase_units[0].payee?.merchant_id).toBe("SANDBOX_M_9921");
  });

  it("captures an existing order and confirms COMPLETED settlement and capture ID", async () => {
    const client = new PayPalClient();
    const orderRequest: CreateOrderRequest = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "PU-CAPTURE-TEST",
          amount: { currency_code: "USD", value: "14.00" },
        },
      ],
    };

    const createdOrder = await client.createOrder(orderRequest);
    expect(createdOrder.id).toBeDefined();

    const capturedOrder = await client.captureOrder(createdOrder.id);

    expect(capturedOrder.id).toBe(createdOrder.id);
    expect(capturedOrder.status).toBe("COMPLETED");
    expect(capturedOrder.intent).toBe("CAPTURE");

    const captures = capturedOrder.purchase_units[0]?.payments?.captures;
    expect(captures).toBeDefined();
    expect(captures?.length).toBe(1);

    const capture = captures![0];
    expect(capture.id.startsWith("CAP-")).toBe(true);
    expect(capture.status).toBe("COMPLETED");
    expect(capture.amount.currency_code).toBe("USD");
  });
});

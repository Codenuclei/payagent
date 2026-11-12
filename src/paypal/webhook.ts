import { createHmac } from "crypto";

export interface PayPalWebhookEvent {
  id: string;
  event_version: string;
  create_time: string;
  resource_type: "capture" | "order";
  event_type: "PAYMENT.CAPTURE.COMPLETED" | "CHECKOUT.ORDER.APPROVED" | "PAYMENT.CAPTURE.DENIED";
  summary: string;
  resource: Record<string, unknown>;
  links: Array<{ href: string; rel: string; method: string }>;
}

export class PayPalWebhookEngine {
  private webhookSecret: string;

  constructor(secret = "webhook_secret_payagent_hackathon") {
    this.webhookSecret = secret;
  }

  public createEvent(
    eventType: PayPalWebhookEvent["event_type"],
    resource: Record<string, unknown>,
    summary: string
  ): { event: PayPalWebhookEvent; signature: string } {
    const event: PayPalWebhookEvent = {
      id: "WH-" + Math.random().toString(36).substring(2, 10).toUpperCase(),
      event_version: "1.0",
      create_time: new Date().toISOString(),
      resource_type: eventType.includes("CAPTURE") ? "capture" : "order",
      event_type: eventType,
      summary,
      resource,
      links: [
        {
          href: `https://api-m.sandbox.paypal.com/v1/notifications/webhooks-events`,
          rel: "self",
          method: "GET",
        },
      ],
    };

    const signature = createHmac("sha256", this.webhookSecret)
      .update(JSON.stringify(event))
      .digest("hex");

    return { event, signature };
  }

  public verifySignature(event: PayPalWebhookEvent, signature: string): boolean {
    const expected = createHmac("sha256", this.webhookSecret)
      .update(JSON.stringify(event))
      .digest("hex");
    return expected === signature;
  }
}

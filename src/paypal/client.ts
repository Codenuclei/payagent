import type { CreateOrderRequest, PayPalOrderResponse } from "./types";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
}

export interface ConnectionTestResult {
  connected: boolean;
  mode: "LIVE_SANDBOX" | "SIMULATION";
  message: string;
  scopes?: string;
  expiresIn?: number;
  statusCode?: number;
}

export class PayPalClient {
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private isSimulation: boolean = false;

  constructor(config?: Partial<PayPalConfig>) {
    this.clientId = config?.clientId || process.env.PAYPAL_CLIENT_ID || "";
    this.clientSecret = config?.clientSecret || process.env.PAYPAL_CLIENT_SECRET || "";
    const isSandbox = config?.sandbox !== false;
    this.baseUrl = isSandbox
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";

    if (!this.clientId || !this.clientSecret) {
      this.isSimulation = true;
    }
  }

  public get simulationMode(): boolean {
    return this.isSimulation;
  }

  public get hasCredentials(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  public setCredentials(clientId: string, clientSecret: string): void {
    this.clientId = clientId.trim();
    this.clientSecret = clientSecret.trim();
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.isSimulation = !this.clientId || !this.clientSecret;
  }

  public async testLiveConnection(): Promise<ConnectionTestResult> {
    if (!this.clientId || !this.clientSecret) {
      return {
        connected: false,
        mode: "SIMULATION",
        message: "No PayPal Developer credentials configured. Running in high-fidelity sandbox simulation mode.",
      };
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    try {
      const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });

      if (!res.ok) {
        const errorBody = await res.text();
        return {
          connected: false,
          mode: "SIMULATION",
          statusCode: res.status,
          message: `PayPal OAuth authentication rejected (${res.status}): ${errorBody}`,
        };
      }

      const data = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
      this.isSimulation = false;

      return {
        connected: true,
        mode: "LIVE_SANDBOX",
        message: "Successfully authenticated with PayPal Developer Platform (api-m.sandbox.paypal.com).",
        scopes: data.scope,
        expiresIn: data.expires_in,
        statusCode: 200,
      };
    } catch (err: any) {
      return {
        connected: false,
        mode: "SIMULATION",
        message: `Network failure connecting to PayPal Sandbox: ${err?.message || err}`,
      };
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.isSimulation) {
      return "simulated_paypal_access_token_" + Date.now();
    }

    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      console.warn(`[PayPal] Live OAuth failed (${res.status}). Falling back to simulation mode.`);
      this.isSimulation = true;
      return "simulated_paypal_access_token_" + Date.now();
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  public async createOrder(orderReq: CreateOrderRequest): Promise<PayPalOrderResponse> {
    if (this.isSimulation) {
      const orderId = "ORD-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      return {
        id: orderId,
        status: "CREATED",
        intent: orderReq.intent,
        create_time: new Date().toISOString(),
        links: [
          {
            href: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
            rel: "approve",
            method: "GET",
          },
          {
            href: `${this.baseUrl}/v2/checkout/orders/${orderId}`,
            rel: "self",
            method: "GET",
          },
          {
            href: `${this.baseUrl}/v2/checkout/orders/${orderId}/capture`,
            rel: "capture",
            method: "POST",
          },
        ],
        purchase_units: orderReq.purchase_units.map((unit, idx) => ({
          reference_id: unit.reference_id || `PU-${idx + 1}`,
          amount: unit.amount,
          payee: {
            email_address: "merchant-sandbox@payagent.network",
            merchant_id: "SANDBOX_M_9921",
          },
        })),
      };
    }

    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderReq),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`PayPal Order Creation failed [${res.status}]: ${errorText}`);
    }

    return (await res.json()) as PayPalOrderResponse;
  }

  public async captureOrder(orderId: string): Promise<PayPalOrderResponse> {
    if (this.isSimulation) {
      const captureId = "CAP-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      return {
        id: orderId,
        status: "COMPLETED",
        intent: "CAPTURE",
        create_time: new Date().toISOString(),
        links: [
          {
            href: `${this.baseUrl}/v2/checkout/orders/${orderId}`,
            rel: "self",
            method: "GET",
          },
        ],
        purchase_units: [
          {
            reference_id: "PU-1",
            amount: { currency_code: "USD", value: "14.00" },
            payments: {
              captures: [
                {
                  id: captureId,
                  status: "COMPLETED",
                  amount: { currency_code: "USD", value: "14.00" },
                  create_time: new Date().toISOString(),
                },
              ],
            },
          },
        ],
      };
    }

    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`PayPal Order Capture failed [${res.status}]: ${errorText}`);
    }

    return (await res.json()) as PayPalOrderResponse;
  }
}

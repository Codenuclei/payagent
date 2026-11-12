export interface PayPalAmount {
  currency_code: string;
  value: string;
  breakdown?: {
    item_total?: { currency_code: string; value: string };
    tax_total?: { currency_code: string; value: string };
    shipping?: { currency_code: string; value: string };
  };
}

export interface PayPalItem {
  name: string;
  unit_amount: { currency_code: string; value: string };
  quantity: string;
  description?: string;
  sku?: string;
  category?: "DIGITAL_GOODS" | "PHYSICAL_GOODS" | "DONATION";
}

export interface PayPalPurchaseUnit {
  reference_id?: string;
  description?: string;
  custom_id?: string;
  amount: PayPalAmount;
  items?: PayPalItem[];
}

export interface CreateOrderRequest {
  intent: "CAPTURE" | "AUTHORIZE";
  purchase_units: PayPalPurchaseUnit[];
  application_context?: {
    brand_name?: string;
    landing_page?: "LOGIN" | "BILLING" | "NO_PREFERENCE";
    user_action?: "CONTINUE" | "PAY_NOW";
    return_url?: string;
    cancel_url?: string;
  };
}

export interface PayPalOrderResponse {
  id: string;
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  intent: "CAPTURE" | "AUTHORIZE";
  create_time: string;
  links: Array<{
    href: string;
    rel: string;
    method: string;
  }>;
  purchase_units: Array<{
    reference_id: string;
    amount: PayPalAmount;
    payee?: { email_address: string; merchant_id: string };
    payments?: {
      captures?: Array<{
        id: string;
        status: "COMPLETED" | "DECLINED" | "PENDING";
        amount: PayPalAmount;
        create_time: string;
      }>;
    };
  }>;
}

export interface TransactionRecord {
  id: string;
  paypalOrderId: string;
  captureId?: string;
  itemName: string;
  vendor: string;
  category: string;
  amount: number;
  currency: string;
  status: "APPROVED_AUTO" | "APPROVED_MANUAL" | "BLOCKED_GUARDRAIL" | "SETTLED" | "FAILED";
  policyCheck: {
    passed: boolean;
    reason: string;
    riskScore: number;
  };
  agentIntent: string;
  timestamp: string;
  approvalUrl?: string;
  rawResponse?: any;
}

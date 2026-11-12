export interface AdversarialCheckResult {
  isSafe: boolean;
  threatLevel: "NONE" | "LOW" | "MEDIUM" | "CRITICAL";
  riskScore: number; // 0 to 100
  flaggedVectors: string[];
  sanitizedPrompt: string;
}

export class AdversarialShield {
  private static readonly INJECTION_PATTERNS: Array<{ regex: RegExp; vector: string; penalty: number }> = [
    { regex: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|limits|guardrails)/i, vector: "INSTRUCTION_OVERRIDE_ATTEMPT", penalty: 75 },
    { regex: /bypass\s+(the\s+)?(guardrail|budget|security|policy|limit|approval)/i, vector: "GUARDRAIL_BYPASS_ATTEMPT", penalty: 80 },
    { regex: /(disregard|forget|drop)\s+(the\s+)?(spending|daily|order)\s+(limit|cap|rules)/i, vector: "BUDGET_DISREGARD_ATTEMPT", penalty: 75 },
    { regex: /(system\s*prompt|admin\s*mode|root\s*access|sudo\s+execute|developer\s*mode)/i, vector: "PRIVILEGE_ESCALATION_SYNTAX", penalty: 60 },
    { regex: /(transfer|drain|send|forward)\s+(all|entire|max)\s+(funds|balance|money|wallet)/i, vector: "UNRESTRICTED_DRAIN_ATTEMPT", penalty: 85 },
    { regex: /(\b0x[a-fA-F0-9]{40}\b|bc1[a-zA-HJ-NP-Z0-9]{25,39})/i, vector: "UNAUTHORIZED_CRYPTO_WALLET_REDIRECT", penalty: 70 },
    { regex: /(<script|javascript:|eval\(|base64_decode)/i, vector: "PAYLOAD_INJECTION_XSS_EVAL", penalty: 90 },
    { regex: /(\brm\s+-rf\b|\/etc\/passwd|\bexec\(|\bchild_process\b)/i, vector: "ARBITRARY_COMMAND_INJECTION", penalty: 95 },
  ];

  public static inspect(prompt: string): AdversarialCheckResult {
    const raw = prompt || "";
    const flaggedVectors: string[] = [];
    let riskScore = 0;

    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.regex.test(raw)) {
        flaggedVectors.push(pattern.vector);
        riskScore += pattern.penalty;
      }
    }

    // Check for excessive hidden delimiter injection
    const delimiterCount = (raw.match(/(\n|\r|\t|---|\*\*\*|===|```)/g) || []).length;
    if (delimiterCount > 12) {
      flaggedVectors.push("SUSPICIOUS_DELIMITER_DENSITY");
      riskScore += 25;
    }

    const finalScore = Math.min(riskScore, 100);
    let threatLevel: AdversarialCheckResult["threatLevel"] = "NONE";
    if (finalScore >= 70) threatLevel = "CRITICAL";
    else if (finalScore >= 40) threatLevel = "MEDIUM";
    else if (finalScore > 0) threatLevel = "LOW";

    // Basic sanitization
    const sanitized = raw.replace(/[<>{}\\]/g, "").trim();

    return {
      isSafe: finalScore < 40,
      threatLevel,
      riskScore: finalScore,
      flaggedVectors,
      sanitizedPrompt: sanitized,
    };
  }
}

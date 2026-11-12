import { createHash } from "crypto";
import type { TransactionRecord } from "../paypal/types";

export interface AuditBlock {
  blockHeight: number;
  previousHash: string;
  blockHash: string;
  nonce: string;
  timestamp: string;
  transaction: TransactionRecord;
}

export class CryptographicAuditLedger {
  private chain: AuditBlock[] = [];
  private seenNonces: Set<string> = new Set();
  private static readonly GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

  public record(tx: TransactionRecord, clientNonce?: string): AuditBlock {
    const nonce = clientNonce || this.generateNonce(tx.id);

    // Replay attack check
    if (this.seenNonces.has(nonce)) {
      throw new Error(`Replay attack detected: Nonce '${nonce}' has already been processed.`);
    }
    this.seenNonces.add(nonce);

    const blockHeight = this.chain.length;
    const previousHash = blockHeight === 0 ? CryptographicAuditLedger.GENESIS_HASH : this.chain[blockHeight - 1].blockHash;

    const blockHash = this.computeHash(blockHeight, previousHash, tx, nonce);

    const block: AuditBlock = {
      blockHeight,
      previousHash,
      blockHash,
      nonce,
      timestamp: new Date().toISOString(),
      transaction: { ...tx },
    };

    this.chain.push(block);
    return block;
  }

  public getChain(): AuditBlock[] {
    return [...this.chain];
  }

  public getLatestBlock(): AuditBlock | null {
    return this.chain.length > 0 ? this.chain[this.chain.length - 1] : null;
  }

  public verifyIntegrity(): { isValid: boolean; corruptedBlockIndex?: number; reason?: string } {
    for (let i = 0; i < this.chain.length; i++) {
      const current = this.chain[i];
      const expectedPrev = i === 0 ? CryptographicAuditLedger.GENESIS_HASH : this.chain[i - 1].blockHash;

      if (current.previousHash !== expectedPrev) {
        return {
          isValid: false,
          corruptedBlockIndex: i,
          reason: `Broken hash link at block ${i}: expected previousHash ${expectedPrev}, found ${current.previousHash}`,
        };
      }

      const recomputed = this.computeHash(current.blockHeight, current.previousHash, current.transaction, current.nonce);
      if (current.blockHash !== recomputed) {
        return {
          isValid: false,
          corruptedBlockIndex: i,
          reason: `Hash mismatch at block ${i}: stored ${current.blockHash}, recomputed ${recomputed}. Tampered transaction data!`,
        };
      }
    }

    return { isValid: true };
  }

  private generateNonce(seed: string): string {
    return createHash("sha256").update(`${seed}:${Date.now()}:${Math.random()}`).digest("hex").substring(0, 16);
  }

  private computeHash(height: number, prev: string, tx: TransactionRecord, nonce: string): string {
    const payload = `${height}:${prev}:${tx.id}:${tx.paypalOrderId}:${tx.amount}:${tx.status}:${tx.vendor}:${nonce}`;
    return createHash("sha256").update(payload).digest("hex");
  }
}


import { Account } from "@aptos-labs/ts-sdk";
import { BlockchainService } from "./blockchain.service";

export interface EscrowInfo {
  jobId: number;
  providerAddress: string;
  totalAmount: number;
  releasedAmount: number;
  isActive: boolean;
}

export interface DepositEscrowParams {
  jobId: number;
  providerAddress: string;
  amount: number; // in Octas
}

export class EscrowService {
  private readonly MODULE_NAME = "escrow";

  constructor(private blockchain: BlockchainService) {}

  /**
   * Deposit escrow for a job - locks coins
   * @param buyer - The buyer's account
   * @param params - Escrow deposit parameters
   * @returns Transaction hash
   */
  async depositEscrow(buyer: Account, params: DepositEscrowParams): Promise<string> {
    // Validate parameters
    if (params.amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }
    if (!params.providerAddress || params.providerAddress.trim() === "") {
      throw new Error("Provider address is required");
    }
    if (params.jobId < 0) {
      throw new Error("Job ID must be valid");
    }

    const args = [
      params.jobId.toString(),
      params.providerAddress,
      params.amount.toString(),
    ];

    const result = await this.blockchain.executeTransaction(
      buyer,
      this.MODULE_NAME,
      "deposit_escrow",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Release payment to provider (called during streaming or at completion)
   * @param buyer - The buyer's account
   * @param jobId - The job ID
   * @param amount - Amount to release in Octas
   * @returns Transaction hash
   */
  async releasePayment(
    buyer: Account,
    jobId: number,
    amount: number
  ): Promise<string> {
    if (amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    const args = [jobId.toString(), amount.toString()];

    const result = await this.blockchain.executeTransaction(
      buyer,
      this.MODULE_NAME,
      "release_payment",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Refund remaining escrow to buyer (for cancelled/failed jobs)
   * @param buyer - The buyer's account
   * @param jobId - The job ID
   * @returns Transaction hash
   */
  async refundEscrow(buyer: Account, jobId: number): Promise<string> {
    const args = [jobId.toString()];

    const result = await this.blockchain.executeTransaction(
      buyer,
      this.MODULE_NAME,
      "refund_escrow",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Close escrow and return any remaining funds (after job completion)
   * @param buyer - The buyer's account
   * @param jobId - The job ID
   * @returns Transaction hash
   */
  async closeEscrow(buyer: Account, jobId: number): Promise<string> {
    const args = [jobId.toString()];

    const result = await this.blockchain.executeTransaction(
      buyer,
      this.MODULE_NAME,
      "close_escrow",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Get escrow information
   * @param buyerAddress - The buyer's address
   * @param jobId - The job ID
   * @returns Escrow information
   */
  async getEscrow(buyerAddress: string, jobId: number): Promise<EscrowInfo> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "get_escrow",
        [buyerAddress, jobId.toString()]
      );

      // Result format: [job_id, provider_address, total_amount, released_amount, is_active]
      return {
        jobId: Number(result[0]),
        providerAddress: result[1] as string,
        totalAmount: Number(result[2]),
        releasedAmount: Number(result[3]),
        isActive: result[4] as boolean,
      };
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(`Escrow not found: jobId=${jobId}, buyer=${buyerAddress}`);
      }
      throw error;
    }
  }

  /**
   * Get remaining balance in escrow
   * @param buyerAddress - The buyer's address
   * @param jobId - The job ID
   * @returns Remaining balance in Octas
   */
  async getRemainingBalance(buyerAddress: string, jobId: number): Promise<number> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "get_remaining_balance",
        [buyerAddress, jobId.toString()]
      );
      return Number(result);
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(`Escrow not found: jobId=${jobId}, buyer=${buyerAddress}`);
      }
      throw error;
    }
  }

  /**
   * Check if escrow is active
   * @param buyerAddress - The buyer's address
   * @param jobId - The job ID
   * @returns True if escrow exists and is active
   */
  async isEscrowActive(buyerAddress: string, jobId: number): Promise<boolean> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "is_escrow_active",
        [buyerAddress, jobId.toString()]
      );
      return result as boolean;
    } catch (error: any) {
      // If escrow doesn't exist, return false
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get released amount from escrow
   * @param buyerAddress - The buyer's address
   * @param jobId - The job ID
   * @returns Released amount in Octas
   */
  async getReleasedAmount(buyerAddress: string, jobId: number): Promise<number> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "get_released_amount",
        [buyerAddress, jobId.toString()]
      );
      return Number(result);
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(`Escrow not found: jobId=${jobId}, buyer=${buyerAddress}`);
      }
      throw error;
    }
  }
}


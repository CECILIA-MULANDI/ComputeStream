
import { Account } from "@aptos-labs/ts-sdk";
import { BlockchainService } from "./blockchain.service";

export interface StreamInfo {
  jobId: number;
  payeeAddress: string;
  ratePerSecond: number;
  startTime: number;
  totalStreamed: number;
  isActive: boolean;
}

export interface OpenStreamParams {
  jobId: number;
  payeeAddress: string;
  ratePerSecond: number;
  startTime?: number; // Optional, defaults to current time
}

export class PaymentStreamService {
  private readonly MODULE_NAME = "payment_stream";

  constructor(private blockchain: BlockchainService) {}

  /**
   * Open a new payment stream
   * @param payer - The payer's account (buyer)
   * @param params - Stream parameters
   * @returns Transaction hash
   */
  async openStream(payer: Account, params: OpenStreamParams): Promise<string> {
    // Validate parameters
    if (params.ratePerSecond <= 0) {
      throw new Error("Rate per second must be greater than 0");
    }
    if (!params.payeeAddress || params.payeeAddress.trim() === "") {
      throw new Error("Payee address is required");
    }
    if (params.jobId < 0) {
      throw new Error("Job ID must be valid");
    }

    const startTime = params.startTime || Math.floor(Date.now() / 1000);

    const args = [
      params.jobId.toString(),
      params.payeeAddress,
      params.ratePerSecond.toString(),
      startTime.toString(),
    ];

    const result = await this.blockchain.executeTransaction(
      payer,
      this.MODULE_NAME,
      "open_stream",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Process payment (called every second by payment orchestrator)
   * This calculates elapsed time and releases payment from escrow
   * @param payer - The payer's account
   * @param jobId - The job ID
   * @param currentTime - Current Unix timestamp in seconds
   * @returns Transaction hash
   */
  async processPayment(
    payer: Account,
    jobId: number,
    currentTime: number = Math.floor(Date.now() / 1000)
  ): Promise<string> {
    const args = [jobId.toString(), currentTime.toString()];

    const result = await this.blockchain.executeTransaction(
      payer,
      this.MODULE_NAME,
      "process_payment",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Close stream (when job completes or fails)
   * Processes final payment and marks stream as inactive
   * @param payer - The payer's account
   * @param jobId - The job ID
   * @param finalTime - Final Unix timestamp in seconds
   * @returns Transaction hash
   */
  async closeStream(
    payer: Account,
    jobId: number,
    finalTime: number = Math.floor(Date.now() / 1000)
  ): Promise<string> {
    const args = [jobId.toString(), finalTime.toString()];

    const result = await this.blockchain.executeTransaction(
      payer,
      this.MODULE_NAME,
      "close_stream",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Pause stream (emergency stop)
   * Processes payment up to pause time and marks stream as inactive
   * @param payer - The payer's account
   * @param jobId - The job ID
   * @param pauseTime - Pause Unix timestamp in seconds
   * @returns Transaction hash
   */
  async pauseStream(
    payer: Account,
    jobId: number,
    pauseTime: number = Math.floor(Date.now() / 1000)
  ): Promise<string> {
    const args = [jobId.toString(), pauseTime.toString()];

    const result = await this.blockchain.executeTransaction(
      payer,
      this.MODULE_NAME,
      "pause_stream",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Resume stream
   * Marks stream as active and updates last claimed time
   * @param payer - The payer's account
   * @param jobId - The job ID
   * @param resumeTime - Resume Unix timestamp in seconds
   * @returns Transaction hash
   */
  async resumeStream(
    payer: Account,
    jobId: number,
    resumeTime: number = Math.floor(Date.now() / 1000)
  ): Promise<string> {
    const args = [jobId.toString(), resumeTime.toString()];

    const result = await this.blockchain.executeTransaction(
      payer,
      this.MODULE_NAME,
      "resume_stream",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Get stream information
   * @param payerAddress - The payer's address
   * @param jobId - The job ID
   * @returns Stream information
   */
  async getStream(payerAddress: string, jobId: number): Promise<StreamInfo> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "get_stream",
        [payerAddress, jobId.toString()]
      );

      // Result format: [job_id, payee_address, rate_per_second, start_time, total_streamed, is_active]
      return {
        jobId: Number(result[0]),
        payeeAddress: result[1] as string,
        ratePerSecond: Number(result[2]),
        startTime: Number(result[3]),
        totalStreamed: Number(result[4]),
        isActive: result[5] as boolean,
      };
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(`Stream not found: jobId=${jobId}, payer=${payerAddress}`);
      }
      throw error;
    }
  }

  /**
   * Get total amount streamed so far
   * @param payerAddress - The payer's address
   * @param jobId - The job ID
   * @returns Total streamed amount in Octas
   */
  async getTotalStreamed(payerAddress: string, jobId: number): Promise<number> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "get_total_streamed",
        [payerAddress, jobId.toString()]
      );
      return Number(result);
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(`Stream not found: jobId=${jobId}, payer=${payerAddress}`);
      }
      throw error;
    }
  }

  /**
   * Calculate current amount (including pending)
   * @param payerAddress - The payer's address
   * @param jobId - The job ID
   * @param currentTime - Current Unix timestamp in seconds
   * @returns Current total amount (streamed + pending) in Octas
   */
  async calculateCurrentAmount(
    payerAddress: string,
    jobId: number,
    currentTime: number = Math.floor(Date.now() / 1000)
  ): Promise<number> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "calculate_current_amount",
        [payerAddress, jobId.toString(), currentTime.toString()]
      );
      return Number(result);
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(`Stream not found: jobId=${jobId}, payer=${payerAddress}`);
      }
      throw error;
    }
  }

  /**
   * Check if stream is active
   * @param payerAddress - The payer's address
   * @param jobId - The job ID
   * @returns True if stream exists and is active
   */
  async isStreamActive(payerAddress: string, jobId: number): Promise<boolean> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "is_stream_active",
        [payerAddress, jobId.toString()]
      );
      return result as boolean;
    } catch (error: any) {
      // If stream doesn't exist, return false
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        return false;
      }
      throw error;
    }
  }
}


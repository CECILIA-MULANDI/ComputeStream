
import { Account } from "@aptos-labs/ts-sdk";
import { BlockchainService } from "./blockchain.service.js";

export enum JobStatus {
  PENDING = 0,
  RUNNING = 1,
  COMPLETED = 2,
  FAILED = 3,
  CANCELLED = 4,
}

export interface JobInfo {
  jobId: number;
  buyerAddress: string;
  providerAddress: string;
  status: JobStatus;
  escrowAmount: number;
  startTime: number;
  endTime: number;
}

export interface CreateJobParams {
  providerAddress: string;
  dockerImage: string;
  escrowAmount: number;
  maxDuration: number; // in seconds
}

export class JobService {
  private readonly MODULE_NAME = "job_registry";

  constructor(private blockchain: BlockchainService) {}

  /**
   * Get the current job counter (next job ID will be this value)
   * @returns Current job counter value
   */
  async getJobCounter(): Promise<number> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "get_job_counter",
        []
      );
      return Number(result);
    } catch (error: any) {
      // If counter doesn't exist yet, return 0
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        return 0;
      }
      throw error;
    }
  }

  /**
   * Create a new job
   * @param buyer - The buyer's account
   * @param params - Job creation parameters
   * @returns Transaction hash and job ID
   */
  async createJob(buyer: Account, params: CreateJobParams): Promise<{ hash: string; jobId: number }> {
    // Validate parameters
    if (!params.providerAddress || params.providerAddress.trim() === "") {
      throw new Error("Provider address is required");
    }
    if (!params.dockerImage || params.dockerImage.trim() === "") {
      throw new Error("Docker image is required");
    }
    if (params.escrowAmount <= 0) {
      throw new Error("Escrow amount must be greater than 0");
    }
    if (params.maxDuration <= 0) {
      throw new Error("Max duration must be greater than 0");
    }

    // Get the current job counter to know what the job ID will be
    const currentCounter = await this.getJobCounter();
    const jobId = currentCounter;

    const args = [
      params.providerAddress,
      params.dockerImage,
      params.escrowAmount.toString(),
      params.maxDuration.toString(),
    ];

    const result = await this.blockchain.executeTransaction(
      buyer,
      this.MODULE_NAME,
      "create_job",
      args,
      true
    );

    return { hash: result.hash, jobId };
  }

  /**
   * Start a job (called by provider)
   * @param provider - The provider's account
   * @param buyerAddress - The buyer's address
   * @param jobId - The job ID
   * @param startTime - Unix timestamp in seconds
   * @returns Transaction hash
   */
  async startJob(
    provider: Account,
    buyerAddress: string,
    jobId: number,
    startTime: number = Math.floor(Date.now() / 1000)
  ): Promise<string> {
    const args = [buyerAddress, jobId.toString(), startTime.toString()];

    const result = await this.blockchain.executeTransaction(
      provider,
      this.MODULE_NAME,
      "start_job",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Complete a job (called by provider)
   * @param provider - The provider's account
   * @param buyerAddress - The buyer's address
   * @param jobId - The job ID
   * @param outputUrl - URL to job output/artifacts
   * @param endTime - Unix timestamp in seconds
   * @returns Transaction hash
   */
  async completeJob(
    provider: Account,
    buyerAddress: string,
    jobId: number,
    outputUrl: string,
    endTime: number = Math.floor(Date.now() / 1000)
  ): Promise<string> {
    if (!outputUrl || outputUrl.trim() === "") {
      throw new Error("Output URL is required");
    }

    const args = [buyerAddress, jobId.toString(), endTime.toString(), outputUrl];

    const result = await this.blockchain.executeTransaction(
      provider,
      this.MODULE_NAME,
      "complete_job",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Fail a job (can be called by buyer or provider)
   * @param account - The account calling this (buyer or provider)
   * @param buyerAddress - The buyer's address
   * @param jobId - The job ID
   * @param endTime - Unix timestamp in seconds
   * @returns Transaction hash
   */
  async failJob(
    account: Account,
    buyerAddress: string,
    jobId: number,
    endTime: number = Math.floor(Date.now() / 1000)
  ): Promise<string> {
    const args = [buyerAddress, jobId.toString(), endTime.toString()];

    const result = await this.blockchain.executeTransaction(
      account,
      this.MODULE_NAME,
      "fail_job",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Cancel a job (called by buyer, only if pending)
   * @param buyer - The buyer's account
   * @param jobId - The job ID
   * @returns Transaction hash
   */
  async cancelJob(buyer: Account, jobId: number): Promise<string> {
    const args = [jobId.toString()];

    const result = await this.blockchain.executeTransaction(
      buyer,
      this.MODULE_NAME,
      "cancel_job",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Get job information
   * @param buyerAddress - The buyer's address
   * @param jobId - The job ID
   * @returns Job information
   */
  async getJob(buyerAddress: string, jobId: number): Promise<JobInfo> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "get_job",
        [buyerAddress, jobId.toString()]
      );

      // Result format: [job_id, buyer_address, provider_address, status, escrow_amount, start_time, end_time]
      return {
        jobId: Number(result[0]),
        buyerAddress: result[1] as string,
        providerAddress: result[2] as string,
        status: Number(result[3]) as JobStatus,
        escrowAmount: Number(result[4]),
        startTime: Number(result[5]),
        endTime: Number(result[6]),
      };
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(`Job not found: jobId=${jobId}, buyer=${buyerAddress}`);
      }
      throw error;
    }
  }

  /**
   * Get job status
   * @param buyerAddress - The buyer's address
   * @param jobId - The job ID
   * @returns Job status
   */
  async getJobStatus(buyerAddress: string, jobId: number): Promise<JobStatus> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "get_job_status",
        [buyerAddress, jobId.toString()]
      );
      return Number(result) as JobStatus;
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(`Job not found: jobId=${jobId}, buyer=${buyerAddress}`);
      }
      throw error;
    }
  }

  /**
   * Check if job is active (running)
   * @param buyerAddress - The buyer's address
   * @param jobId - The job ID
   * @returns True if job is running
   */
  async isJobActive(buyerAddress: string, jobId: number): Promise<boolean> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "is_job_active",
        [buyerAddress, jobId.toString()]
      );
      return result as boolean;
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get job duration in seconds
   * @param buyerAddress - The buyer's address
   * @param jobId - The job ID
   * @returns Duration in seconds, or 0 if not completed
   */
  async getJobDuration(buyerAddress: string, jobId: number): Promise<number> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "get_job_duration",
        [buyerAddress, jobId.toString()]
      );
      return Number(result);
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(`Job not found: jobId=${jobId}, buyer=${buyerAddress}`);
      }
      throw error;
    }
  }

  /**
   * Get job output URL
   * @param buyerAddress - The buyer's address
   * @param jobId - The job ID
   * @returns Output URL string
   */
  async getJobOutputUrl(buyerAddress: string, jobId: number): Promise<string> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "get_job_output_url",
        [buyerAddress, jobId.toString()]
      );
      return result as string;
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(`Job not found: jobId=${jobId}, buyer=${buyerAddress}`);
      }
      throw error;
    }
  }

  /**
   * Get status name from status code
   */
  getStatusName(status: JobStatus): string {
    return JobStatus[status] || "UNKNOWN";
  }
}


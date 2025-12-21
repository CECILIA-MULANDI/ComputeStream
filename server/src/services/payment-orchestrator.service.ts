// server/src/services/payment-orchestrator.service.ts
import { BlockchainService } from "./blockchain.service";
import { PaymentStreamService } from "./payment-stream.service";
import { Account } from "@aptos-labs/ts-sdk";

export interface ActiveStream {
  payerAddress: string;
  jobId: number;
  payerPrivateKey: string; // For signing transactions
  lastProcessedAt: number; // Unix timestamp
  createdAt: number; // Unix timestamp
}

export class PaymentOrchestratorService {
  private activeStreams: Map<string, ActiveStream> = new Map(); // Key: `${payerAddress}:${jobId}`
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private processingLock: boolean = false;

  constructor(
    private blockchainService: BlockchainService,
    private paymentStreamService: PaymentStreamService
  ) {}

  /**
   * Register an active stream to be processed
   * @param payerAddress - The payer's address
   * @param jobId - The job ID
   * @param payerPrivateKey - Private key for signing transactions
   */
  registerStream(
    payerAddress: string,
    jobId: number,
    payerPrivateKey: string
  ): void {
    const key = `${payerAddress}:${jobId}`;
    const now = Math.floor(Date.now() / 1000);

    this.activeStreams.set(key, {
      payerAddress,
      jobId,
      payerPrivateKey,
      lastProcessedAt: now,
      createdAt: now,
    });

    console.log(`📝 Registered payment stream: ${key}`);
  }

  /**
   * Unregister a stream (when it's closed or paused)
   * @param payerAddress - The payer's address
   * @param jobId - The job ID
   */
  unregisterStream(payerAddress: string, jobId: number): void {
    const key = `${payerAddress}:${jobId}`;
    if (this.activeStreams.delete(key)) {
      console.log(`🗑️  Unregistered payment stream: ${key}`);
    }
  }

  /**
   * Process a single payment stream
   * @param stream - The active stream to process
   */
  private async processStream(stream: ActiveStream): Promise<void> {
    const key = `${stream.payerAddress}:${stream.jobId}`;
    const currentTime = Math.floor(Date.now() / 1000);

    try {
      // Check if stream is still active on-chain
      const isActive = await this.paymentStreamService.isStreamActive(
        stream.payerAddress,
        stream.jobId
      );

      if (!isActive) {
        // Stream is no longer active, remove it
        console.log(`⚠️  Stream ${key} is no longer active on-chain, removing from orchestrator`);
        this.unregisterStream(stream.payerAddress, stream.jobId);
        return;
      }

      // Create account from private key
      const payer = this.blockchainService.createAccountFromPrivateKey(
        stream.payerPrivateKey
      );

      // Process payment
      try {
        await this.paymentStreamService.processPayment(
          payer,
          stream.jobId,
          currentTime
        );

        // Update last processed time
        stream.lastProcessedAt = currentTime;
        console.log(`✅ Processed payment for stream ${key} at ${currentTime}`);
      } catch (error: any) {
        // Handle specific errors
        if (error.message.includes("not found") || error.message.includes("does not exist")) {
          console.log(`⚠️  Stream ${key} not found on-chain, removing from orchestrator`);
          this.unregisterStream(stream.payerAddress, stream.jobId);
        } else if (error.message.includes("not active")) {
          console.log(`⚠️  Stream ${key} is not active, removing from orchestrator`);
          this.unregisterStream(stream.payerAddress, stream.jobId);
        } else if (error.message.includes("insufficient")) {
          console.error(`❌ Insufficient balance for stream ${key}: ${error.message}`);
          // Keep stream registered, will retry next cycle
        } else {
          console.error(`❌ Error processing stream ${key}: ${error.message}`);
          // Keep stream registered, will retry next cycle
        }
      }
    } catch (error: any) {
      console.error(`❌ Unexpected error processing stream ${key}: ${error.message}`);
    }
  }

  /**
   * Process all active payment streams
   */
  private async processAllStreams(): Promise<void> {
    if (this.processingLock) {
      console.log("⏸️  Payment processing already in progress, skipping cycle");
      return;
    }

    if (this.activeStreams.size === 0) {
      return; // No streams to process
    }

    this.processingLock = true;

    try {
      const streams = Array.from(this.activeStreams.values());
      console.log(`🔄 Processing ${streams.length} active payment stream(s)...`);

      // Process streams in parallel (with reasonable concurrency)
      const batchSize = 5; // Process 5 streams at a time
      for (let i = 0; i < streams.length; i += batchSize) {
        const batch = streams.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map((stream) => this.processStream(stream))
        );
      }
    } catch (error: any) {
      console.error(`❌ Error in processAllStreams: ${error.message}`);
    } finally {
      this.processingLock = false;
    }
  }

  /**
   * Start the payment orchestrator
   * Processes payments every second
   */
  start(): void {
    if (this.isRunning) {
      console.log("⚠️  Payment orchestrator is already running");
      return;
    }

    this.isRunning = true;
    console.log("🚀 Starting payment stream orchestrator (processing every 1 second)");

    // Process immediately on start
    this.processAllStreams();

    // Then process every second
    this.intervalId = setInterval(() => {
      this.processAllStreams();
    }, 1000); // 1 second = 1000ms
  }

  /**
   * Stop the payment orchestrator
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log("🛑 Payment orchestrator stopped");
  }

  /**
   * Get status of the orchestrator
   */
  getStatus(): {
    isRunning: boolean;
    activeStreamsCount: number;
    activeStreams: Array<{ payerAddress: string; jobId: number }>;
  } {
    return {
      isRunning: this.isRunning,
      activeStreamsCount: this.activeStreams.size,
      activeStreams: Array.from(this.activeStreams.values()).map((s) => ({
        payerAddress: s.payerAddress,
        jobId: s.jobId,
      })),
    };
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): ActiveStream[] {
    return Array.from(this.activeStreams.values());
  }
}


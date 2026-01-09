import { BlockchainService } from "./blockchain.service.js";
import { providerRepository } from "../../database/repositories/provider.repository.js";
import { jobRepository } from "../../database/repositories/job.repository.js";
import { escrowRepository } from "../../database/repositories/escrow.repository.js";
import { paymentStreamRepository } from "../../database/repositories/payment-stream.repository.js";
import { testConnection, pool } from "../../database/connection.js";

const CONTRACT_ADDRESS = "0x69fa4604bbf4e835e978b4d7ef1cfe365f589291428a9d6332b6cd9f4e5e8ff1";

export class IndexerService {
  private blockchainService: BlockchainService;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private lastProcessedVersion: bigint = 0n;
  private syncInProgress: boolean = false;

  constructor() {
    this.blockchainService = new BlockchainService();
  }

  /**
   * Start the indexer service
   * Polls blockchain every 15 seconds for new events and transactions
   */
  async start() {
    if (this.isRunning) {
      console.log("⚠️  Indexer is already running");
      return;
    }

    // Test database connection first
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error("❌ Failed to connect to database. Indexer not started.");
      return;
    }

    this.isRunning = true;
    console.log("🔍 Starting blockchain indexer...");

    // Get initial ledger version
    try {
      const ledger = await this.blockchainService.getClient().getLedgerInfo();
      this.lastProcessedVersion = BigInt(ledger.ledger_version);
      console.log(`📍 Starting from ledger version: ${this.lastProcessedVersion}`);
    } catch (error: any) {
      console.error("Failed to get initial ledger version:", error.message);
    }

    // Load last processed version from database
    await this.loadLastProcessedVersion();

    // Run initial full sync
    await this.fullSync();

    // Then poll every 15 seconds for new events
    this.intervalId = setInterval(() => {
      this.incrementalSync();
    }, 15000); // 15 seconds

    console.log("✅ Indexer started - syncing every 15 seconds");
  }

  /**
   * Stop the indexer service
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log("🛑 Indexer stopped");
  }

  /**
   * Load last processed version from database
   */
  private async loadLastProcessedVersion() {
    try {
      const result = await pool.query(
        "SELECT value FROM indexer_state WHERE key = 'last_processed_version'"
      );
      if (result.rows.length > 0) {
        this.lastProcessedVersion = BigInt(result.rows[0].value);
        console.log(`📚 Resuming from version: ${this.lastProcessedVersion}`);
      }
    } catch (error: any) {
      // Table might not exist yet, create it
      await pool.query(`
        CREATE TABLE IF NOT EXISTS indexer_state (
          key VARCHAR(255) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    }
  }

  /**
   * Save last processed version to database
   */
  private async saveLastProcessedVersion(version: bigint) {
    try {
      await pool.query(
        `INSERT INTO indexer_state (key, value, updated_at) 
         VALUES ('last_processed_version', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [version.toString()]
      );
      this.lastProcessedVersion = version;
    } catch (error: any) {
      console.error("Failed to save last processed version:", error.message);
    }
  }

  /**
   * Full sync - index all historical data from the contract
   */
  private async fullSync() {
    if (this.syncInProgress) return;
    
    this.syncInProgress = true;
    console.log("🔄 Running full blockchain sync...");

    try {
      // Get all transactions for the contract account
      const transactions = await this.getAccountTransactions(CONTRACT_ADDRESS);
      
      let providerCount = 0;
      let jobCount = 0;
      let escrowCount = 0;

      for (const txn of transactions) {
        try {
          // Parse transaction events
          if (txn.events) {
            for (const event of txn.events) {
              const eventType = event.type;

              // Provider registration events
              if (eventType.includes("ProviderRegistered")) {
                await this.handleProviderRegistered(event.data);
                providerCount++;
              }
              // Provider updated events
              else if (eventType.includes("ProviderUpdated")) {
                await this.handleProviderUpdated(event.data);
              }
              // Job created events
              else if (eventType.includes("JobCreated")) {
                await this.handleJobCreated(event.data);
                jobCount++;
              }
              // Job status updated events
              else if (eventType.includes("JobStatusChanged")) {
                await this.handleJobStatusChanged(event.data);
              }
              // Escrow deposited events
              else if (eventType.includes("EscrowDeposited")) {
                await this.handleEscrowDeposited(event.data);
                escrowCount++;
              }
              // Payment stream events
              else if (eventType.includes("PaymentStreamStarted")) {
                await this.handlePaymentStreamStarted(event.data);
              }
              else if (eventType.includes("PaymentStreamStopped")) {
                await this.handlePaymentStreamStopped(event.data);
              }
            }
          }

          // Update last processed version
          if (txn.version) {
            await this.saveLastProcessedVersion(BigInt(txn.version));
          }
        } catch (error: any) {
          console.error(`Error processing transaction ${txn.hash}:`, error.message);
        }
      }

      console.log(`✅ Full sync complete: ${providerCount} providers, ${jobCount} jobs, ${escrowCount} escrows`);
    } catch (error: any) {
      console.error("❌ Full sync failed:", error.message);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Incremental sync - only process new transactions since last sync
   */
  private async incrementalSync() {
    if (this.syncInProgress) {
      console.log("⏳ Sync already in progress, skipping...");
      return;
    }

    this.syncInProgress = true;

    try {
      // Get current ledger version
      const ledger = await this.blockchainService.getClient().getLedgerInfo();
      const currentVersion = BigInt(ledger.ledger_version);

      if (currentVersion <= this.lastProcessedVersion) {
        // No new transactions
        this.syncInProgress = false;
        return;
      }

      console.log(`🔄 Syncing versions ${this.lastProcessedVersion + 1n} to ${currentVersion}`);

      // Get new transactions
      const transactions = await this.getAccountTransactions(
        CONTRACT_ADDRESS,
        Number(this.lastProcessedVersion + 1n),
        Number(currentVersion)
      );

      let eventCount = 0;

      for (const txn of transactions) {
        if (txn.events) {
          for (const event of txn.events) {
            const eventType = event.type;

            if (eventType.includes("ProviderRegistered")) {
              await this.handleProviderRegistered(event.data);
              eventCount++;
            } else if (eventType.includes("ProviderUpdated")) {
              await this.handleProviderUpdated(event.data);
              eventCount++;
            } else if (eventType.includes("JobCreated")) {
              await this.handleJobCreated(event.data);
              eventCount++;
            } else if (eventType.includes("JobStatusChanged")) {
              await this.handleJobStatusChanged(event.data);
              eventCount++;
            } else if (eventType.includes("EscrowDeposited")) {
              await this.handleEscrowDeposited(event.data);
              eventCount++;
            } else if (eventType.includes("PaymentStream")) {
              await this.handlePaymentStreamEvent(event.data);
              eventCount++;
            }
          }
        }
      }

      if (eventCount > 0) {
        console.log(`✅ Processed ${eventCount} new events`);
      }

      // Update last processed version
      await this.saveLastProcessedVersion(currentVersion);
    } catch (error: any) {
      console.error("❌ Incremental sync error:", error.message);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Get all transactions for an account
   */
  private async getAccountTransactions(
    address: string,
    startVersion?: number,
    endVersion?: number
  ): Promise<any[]> {
    try {
      const client = this.blockchainService.getClient();
      const transactions: any[] = [];
      
      // Fetch transactions in batches
      let start = startVersion || 0;
      const limit = 100;

      while (true) {
        const txns = await client.getAccountTransactions({
          accountAddress: address,
          options: {
            offset: start,
            limit: limit,
          },
        });

        if (txns.length === 0) break;

        for (const txn of txns) {
          // Only consider transactions that have a 'version' property (i.e., are not PendingTransactionResponse)
          if ('version' in txn) {
            if (endVersion && BigInt(txn.version) > BigInt(endVersion)) {
              return transactions;
            }
          }
          transactions.push(txn);
        }


        if (txns.length < limit) break;
        start += limit;
      }

      return transactions;
    } catch (error: any) {
      console.error("Error fetching account transactions:", error.message);
      return [];
    }
  }

  /**
   * Handle ProviderRegistered event
   */
  private async handleProviderRegistered(eventData: any) {
    try {
      const address = eventData.provider_address || eventData.address;
      
      // Fetch full provider data from blockchain
      const providerData = await this.blockchainService.callViewFunction(
        "provider_registry",
        "get_provider",
        [address]
      );

      if (providerData && providerData.length >= 5) {
        const [gpuType, vramGB, pricePerSecond, isActive, reputationScore] = providerData;

        await providerRepository.upsert({
          address,
          gpu_type: gpuType,
          vram_gb: Number(vramGB),
          price_per_second: BigInt(pricePerSecond),
          stake_amount: BigInt(eventData.stake_amount || 100000000),
          reputation_score: Number(reputationScore),
          is_active: isActive,
          total_jobs_completed: 0,
          total_earnings: 0n,
        });

        console.log(`📝 Indexed provider: ${address}`);
      }
    } catch (error: any) {
      console.error("Error handling ProviderRegistered:", error.message);
    }
  }

  /**
   * Handle ProviderUpdated event
   */
  private async handleProviderUpdated(eventData: any) {
    try {
      const address = eventData.provider_address || eventData.address;
      
      if (eventData.is_active !== undefined) {
        await providerRepository.updateAvailability(address, eventData.is_active);
      }
      
      if (eventData.price_per_second !== undefined) {
        await providerRepository.updatePricing(address, BigInt(eventData.price_per_second));
      }

      console.log(`🔄 Updated provider: ${address}`);
    } catch (error: any) {
      console.error("Error handling ProviderUpdated:", error.message);
    }
  }

  /**
   * Handle JobCreated event
   */
  private async handleJobCreated(eventData: any) {
    try {
      const jobId = Number(eventData.job_id);
      
      await jobRepository.upsert({
        job_id: jobId,
        buyer_address: eventData.buyer_address || eventData.buyer,
        provider_address: eventData.provider_address || eventData.provider,
        docker_image: eventData.docker_image || '',
        status: 'pending',
        escrow_amount: BigInt(eventData.escrow_amount || 0),
        max_duration: Number(eventData.max_duration || 0),
      });

      console.log(`📋 Indexed job: ${jobId}`);
    } catch (error: any) {
      console.error("Error handling JobCreated:", error.message);
    }
  }

  /**
   * Handle JobStatusChanged event
   */
  private async handleJobStatusChanged(eventData: any) {
    try {
      const jobId = Number(eventData.job_id);
      const newStatus = eventData.new_status || eventData.status;
      
      // Map numeric status to string if needed
      const statusMap: Record<number, string> = {
        0: 'pending',
        1: 'running',
        2: 'completed',
        3: 'failed',
        4: 'cancelled'
      };
      
      const status = typeof newStatus === 'number' ? statusMap[newStatus] : newStatus;
      
      if (status === 'running' && eventData.start_time) {
        await jobRepository.startJob(jobId, Number(eventData.start_time));
      } else if (status === 'completed' && eventData.end_time) {
        await jobRepository.completeJob(jobId, Number(eventData.end_time), eventData.output_url);
      } else if (status === 'failed' && eventData.end_time) {
        await jobRepository.failJob(jobId, Number(eventData.end_time));
      } else {
        await jobRepository.updateStatus(jobId, status);
      }

      console.log(`🔄 Updated job ${jobId} status to: ${status}`);
    } catch (error: any) {
      console.error("Error handling JobStatusChanged:", error.message);
    }
  }

  /**
   * Handle EscrowDeposited event
   */
  private async handleEscrowDeposited(eventData: any) {
    try {
      const jobId = Number(eventData.job_id);
      const amount = BigInt(eventData.amount || eventData.escrow_amount || 0);
      
      await escrowRepository.upsert({
        job_id: jobId,
        buyer_address: eventData.buyer_address || eventData.buyer || eventData.depositor,
        provider_address: eventData.provider_address || eventData.provider || '',
        total_amount: amount,
        released_amount: 0n,
        remaining_amount: amount,
        is_active: true,
        transaction_hash: eventData.transaction_hash,
      });

      console.log(`💰 Indexed escrow for job ${jobId}: ${amount} octas`);
    } catch (error: any) {
      console.error("Error handling EscrowDeposited:", error.message);
    }
  }

  /**
   * Handle PaymentStream events
   */
  private async handlePaymentStreamStarted(eventData: any) {
    try {
      const jobId = Number(eventData.job_id);
      
      await paymentStreamRepository.upsert({
        job_id: jobId,
        payer_address: eventData.payer_address || eventData.payer || eventData.buyer,
        payee_address: eventData.payee_address || eventData.payee || eventData.provider,
        rate_per_second: BigInt(eventData.rate_per_second || eventData.rate || 0),
        start_time: Number(eventData.start_time || Math.floor(Date.now() / 1000)),
        total_streamed: 0n,
        is_active: true,
        transaction_hash: eventData.transaction_hash,
      });

      console.log(`▶️  Indexed payment stream for job ${jobId}`);
    } catch (error: any) {
      console.error("Error handling PaymentStreamStarted:", error.message);
    }
  }

  private async handlePaymentStreamStopped(eventData: any) {
    try {
      const jobId = Number(eventData.job_id);
      const endTime = Number(eventData.end_time || Math.floor(Date.now() / 1000));
      
      await paymentStreamRepository.closeStream(jobId, endTime);

      console.log(`⏹️  Closed payment stream for job ${jobId}`);
    } catch (error: any) {
      console.error("Error handling PaymentStreamStopped:", error.message);
    }
  }

  private async handlePaymentStreamEvent(eventData: any) {
    try {
      const jobId = Number(eventData.job_id);
      
      // If this is a payment processed event, record it
      if (eventData.amount) {
        const stream = await paymentStreamRepository.findByJobId(jobId);
        if (stream && stream.id) {
          await paymentStreamRepository.recordPaymentEvent({
            job_id: jobId,
            stream_id: stream.id,
            amount: BigInt(eventData.amount),
            timestamp: new Date(),
            transaction_hash: eventData.transaction_hash,
            block_number: eventData.block_number ? Number(eventData.block_number) : undefined,
          });
          
          // Also update the total streamed
          await paymentStreamRepository.updateStreamedAmount(jobId, BigInt(eventData.amount));
        }
      }

      console.log(`💸 Processed payment stream event for job ${jobId}`);
    } catch (error: any) {
      console.error("Error handling PaymentStream event:", error.message);
    }
  }

  /**
   * Force a full resync of all blockchain data
   */
  async forceSyncAll() {
    console.log("🔄 Force syncing all blockchain data...");
    this.lastProcessedVersion = 0n;
    await this.saveLastProcessedVersion(0n);
    await this.fullSync();
  }

  /**
   * Get indexer status and stats
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      syncInProgress: this.syncInProgress,
      lastProcessedVersion: this.lastProcessedVersion.toString(),
      contractAddress: CONTRACT_ADDRESS,
    };
  }
}

export const indexerService = new IndexerService();


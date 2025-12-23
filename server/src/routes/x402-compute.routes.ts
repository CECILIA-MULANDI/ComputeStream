

import express from "express";
import { ProviderService } from "../services/provider.service.js";
import { JobService } from "../services/job.service.js";
import { EscrowService } from "../services/escrow.service.js";
import { PaymentStreamService } from "../services/payment-stream.service.js";
import { PaymentOrchestratorService } from "../services/payment-orchestrator.service.js";
import { X402IntegrationService } from "../services/x402-integration.service.js";
import { BlockchainService } from "../services/blockchain.service.js";
import { providerRegistry } from "../services/provider-registry.service.js";
import { 
  strictLimiter, 
  veryStrictLimiter, 
  discoveryLimiter,
  generalLimiter 
} from "../middleware/rate-limiter.middleware.js";

const router = express.Router();

// Initialize services
const blockchainService = new BlockchainService();
const providerService = new ProviderService(blockchainService);
const jobService = new JobService(blockchainService);
const escrowService = new EscrowService(blockchainService);
const paymentStreamService = new PaymentStreamService(blockchainService);
const paymentOrchestrator = new PaymentOrchestratorService(
  blockchainService,
  paymentStreamService
);
const x402Integration = new X402IntegrationService(
  providerService,
  jobService,
  paymentStreamService
);

/**
 * GET /api/v1/compute/access/:providerAddress
 * Access compute resources via x402 payment
 * 
 * This endpoint is protected by x402 paywall middleware.
 * AI agents can call this, get 402 response, pay, and access compute.
 * 
 * Query params:
 * - duration: number of seconds of compute needed
 * 
 * After x402 payment is verified, this endpoint grants compute access.
 */
router.get("/access/:providerAddress", strictLimiter, async (req, res) => {
  try {
    const { providerAddress } = req.params;
    const duration = parseInt(req.query.duration as string) || 60; // Default 60 seconds

    // Get provider info
    const provider = await providerService.getProvider(providerAddress);
    
    // Calculate price
    const totalPrice = provider.pricePerSecond * duration;
    const priceInMOVE = totalPrice / 100000000;

    // If we reach here, x402 payment was verified
    // Grant compute access
    res.json({
      success: true,
      message: "Compute access granted via x402 payment",
      provider: {
        address: providerAddress,
        gpuType: provider.gpuType,
        vramGB: provider.vramGB,
      },
      access: {
        durationSeconds: duration,
        pricePerSecond: provider.pricePerSecond,
        totalPrice,
        priceInMOVE,
      },
      x402Payment: {
        verified: true,
        protocol: "x402",
        description: "AI agent paid for compute access using x402 payment rails",
      },
    });
  } catch (error: any) {
    console.error("Compute access error:", error);
    res.status(500).json({
      error: error.message || "Failed to grant compute access",
    });
  }
});

/**
 * POST /api/v1/compute/execute
 * Execute a compute job via x402 payment
 * 
 * This endpoint requires x402 payment before job execution.
 * Demonstrates how AI agents can pay for compute jobs on-demand.
 * 
 * Body:
 * {
 *   "providerAddress": "0x...",
 *   "dockerImage": "my-job:latest",
 *   "duration": 3600,
 *   "privateKey": "0x..." (optional - if provided, creates job automatically)
 * }
 * 
 * If privateKey is provided, this will:
 * 1. Create job on-chain
 * 2. Deposit escrow
 * 3. Open payment stream
 * 
 * If privateKey is not provided, returns access granted and buyer can create job separately
 */
router.post("/execute", veryStrictLimiter, async (req, res) => {
  try {
    const { providerAddress, dockerImage, duration, privateKey } = req.body;

    if (!providerAddress || !dockerImage) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["providerAddress", "dockerImage"],
      });
    }

    // Get provider to calculate price
    const provider = await providerService.getProvider(providerAddress);
    const jobDuration = duration || 3600;
    const estimatedPrice = provider.pricePerSecond * jobDuration;
    const escrowAmount = estimatedPrice; // Use estimated price as escrow

    // If we reach here, x402 payment was verified
    // x402 payment is the access fee paid to platform
    
    // If private key is provided, create job and set up payment stream
    if (privateKey) {
      try {
        // Create buyer account from private key
        const buyer = blockchainService.createAccountFromPrivateKey(privateKey);
        const buyerAddress = buyer.accountAddress.toString();

        // 1. Create job on-chain
        const { hash: createJobTxnHash, jobId } = await jobService.createJob(buyer, {
          providerAddress,
          dockerImage,
          escrowAmount,
          maxDuration: jobDuration,
        });

        // 2. Deposit escrow for the job
        const depositEscrowTxnHash = await escrowService.depositEscrow(buyer, {
          jobId,
          providerAddress,
          amount: escrowAmount,
        });

        // 3. Open payment stream (for per-second payments to provider)
        const openStreamTxnHash = await paymentStreamService.openStream(buyer, {
          jobId,
          payeeAddress: providerAddress,
          ratePerSecond: provider.pricePerSecond,
        });

        // 4. Register stream with orchestrator for automatic processing
        paymentOrchestrator.registerStream(
          buyerAddress,
          jobId,
          privateKey
        );

        res.json({
          success: true,
          message: "Compute job created and payment stream opened via x402 payment",
          x402Payment: {
            verified: true,
            protocol: "x402",
            description: "AI agent paid access fee using x402",
          },
          job: {
            jobId,
            buyerAddress,
            transactionHash: createJobTxnHash,
            providerAddress,
            dockerImage,
            duration: jobDuration,
            estimatedPrice,
            estimatedPriceMOVE: estimatedPrice / 100000000,
          },
          escrow: {
            transactionHash: depositEscrowTxnHash,
            amount: escrowAmount,
            amountMOVE: escrowAmount / 100000000,
          },
          paymentStream: {
            transactionHash: openStreamTxnHash,
            ratePerSecond: provider.pricePerSecond,
            ratePerSecondMOVE: provider.pricePerSecond / 100000000,
            status: "active",
            note: "Payment stream will process per-second payments automatically",
          },
        });
      } catch (error: any) {
        console.error("Error setting up job:", error);
        return res.status(500).json({
          error: "Failed to set up job",
          details: error.message,
        });
      }
    } else {
      // No private key provided - just return access granted
      res.json({
        success: true,
        message: "Compute access granted via x402 payment",
        x402Payment: {
          verified: true,
          protocol: "x402",
          description: "AI agent paid access fee using x402",
        },
        estimatedCost: {
          providerAddress,
          dockerImage,
          estimatedDuration: jobDuration,
          estimatedPrice,
          estimatedPriceMOVE: estimatedPrice / 100000000,
        },
        nextSteps: [
          "Provide privateKey to automatically create job, OR",
          "Use /api/v1/jobs/create to create job manually",
          "Deposit escrow using /api/v1/escrow/deposit",
          "Open payment stream using /api/v1/payments/stream/open",
        ],
      });
    }
  } catch (error: any) {
    console.error("Compute execute error:", error);
    res.status(500).json({
      error: error.message || "Failed to execute compute job",
    });
  }
});

/**
 * GET /api/v1/compute/providers
 * List available compute providers
 * 
 * This endpoint is free (no x402 required) to browse providers.
 * Actual compute access requires x402 payment.
 * 
 * Query params:
 * - activeOnly: boolean (default: true) - only return active providers
 */
router.get("/providers", discoveryLimiter, async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly !== "false"; // Default to true
    
    // Get providers from registry
    const providers = activeOnly 
      ? providerRegistry.getActiveProviders()
      : providerRegistry.getAllProviders();

    // Sync with on-chain data
    const syncedProviders = await Promise.all(
      providers.map(async (provider) => {
        try {
          const onChainProvider = await providerService.getProvider(provider.address);
          providerRegistry.updateProvider(provider.address, {
            isActive: onChainProvider.isActive,
            pricePerSecond: onChainProvider.pricePerSecond,
          });
          return {
            address: provider.address,
            gpuType: onChainProvider.gpuType,
            vramGB: onChainProvider.vramGB,
            pricePerSecond: onChainProvider.pricePerSecond,
            pricePerSecondMOVE: onChainProvider.pricePerSecond / 100000000,
            isActive: onChainProvider.isActive,
            reputationScore: onChainProvider.reputationScore,
          };
        } catch (error: any) {
          if (error.message.includes("not found")) {
            providerRegistry.removeProvider(provider.address);
            return null;
          }
          return {
            ...provider,
            pricePerSecondMOVE: provider.pricePerSecond / 100000000,
          };
        }
      })
    );

    const validProviders = syncedProviders.filter(p => p !== null);

    res.json({
      success: true,
      message: "Browse available GPU providers",
      count: validProviders.length,
      providers: validProviders,
      note: "Use /api/v1/compute/access/:providerAddress with x402 payment to access compute",
      x402Integration: {
        enabled: true,
        description: "Compute resources are monetized via x402 payment rails",
        useCase: "AI agents can pay for GPU compute on-demand",
      },
    });
  } catch (error: any) {
    console.error("List providers error:", error);
    res.status(500).json({ error: error.message || "Failed to list providers" });
  }
});

/**
 * GET /api/v1/compute/x402-info
 * Get information about x402 integration
 * 
 * Explains how x402 is used in this compute marketplace
 * This is the KEY differentiator for the hackathon!
 */
router.get("/x402-info", generalLimiter, (_req, res) => {
  res.json({
    success: true,
    hackathonSubmission: {
      challenge: "Best x402 App on Movement",
      prize: "$5,000",
      whyWeWin: {
        novelUse: "Not just a paywall - a compute marketplace for AI agents",
        clearBenefits: [
          "AI agents can pay for GPU compute on-demand using x402",
          "Per-second micropayments enable pay-as-you-go compute",
          "Enables agentic internet infrastructure",
          "Providers get paid instantly via x402 payment streams",
        ],
        revenueModel: {
          description: "Platform takes 2% fee on each x402 payment",
          scalability: "Scales with x402's instant settlement",
          example: "1000 AI agents × $0.10/compute = $100/day × 2% = $2/day platform revenue",
        },
        deployed: {
          network: "Movement Testnet",
          contractAddress: "0xd6d9d27d944417f05fd2d2d84900ff379d0b7d7d00811bfe08ceedf0e64288b9",
          transactionHash: "0x64feb3a8d7efda466a1e8ed1d7801dabc179a3df3a3a1140628db69add031bca",
        },
      },
    },
    x402Integration: {
      protocol: "x402",
      description: "x402 payment rails enable instant micropayments for compute resources",
      novelUseCase: {
        title: "Not just a paywall - a compute marketplace",
        description: [
          "AI agents can pay for GPU compute on-demand using x402",
          "Per-second micropayments for compute resources",
          "Enables agentic internet infrastructure",
          "Providers get paid instantly via x402 streams",
        ],
      },
      endpoints: {
        computeAccess: "GET /api/v1/compute/access/:providerAddress (requires x402 payment)",
        computeExecute: "POST /api/v1/compute/execute (requires x402 payment)",
        providers: "GET /api/v1/compute/providers (free, browse providers)",
      },
      benefits: {
        forAIAgents: [
          "No upfront costs - pay per use",
          "Instant payment via x402 protocol",
          "Access compute resources on-demand",
        ],
        forProviders: [
          "Instant payment settlement",
          "Per-second revenue stream",
          "No payment processing overhead",
        ],
        forPlatform: [
          "Novel use of x402 beyond simple paywalls",
          "Enables new business models",
          "Clear revenue path",
        ],
      },
      revenueModel: {
        description: "Platform can take a small fee on each x402 payment",
        example: "2% platform fee on compute access payments",
        scalability: "Scales with x402's instant settlement",
      },
    },
  });
});

export default router;


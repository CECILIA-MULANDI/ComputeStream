import express from "express";
import { BlockchainService } from "../services/blockchain.service.js";
import { providerRepository } from "../../database/repositories/provider.repository.js";
import { 
  discoveryLimiter,
  generalLimiter 
} from "../middleware/rate-limiter.middleware.js";
import { 
  x402ComputeAccess, 
  x402ComputeExecute 
} from "../middleware/x402-compute.middleware.js";

const router = express.Router();

// Initialize services
const blockchainService = new BlockchainService();

/**
 * GET /api/v1/compute/access/:providerAddress
 * Access compute resources via x402 payment with DYNAMIC PRICING
 * 
 * Price is calculated based on:
 * - Provider's actual pricePerSecond
 * - Requested duration
 * 
 * Query params:
 * - duration: number of seconds of compute needed (default: 60)
 * 
 * Flow:
 * 1. Client makes request
 * 2. Server returns 402 with exact price based on provider
 * 3. Client pays via wallet
 * 4. Client retries with payment proof header
 * 5. Server verifies payment and grants access
 */
router.get("/access/:providerAddress", x402ComputeAccess, async (req, res) => {
  // If we reach here, x402 payment was verified by middleware
  const provider = (req as any).x402Provider;
  const duration = (req as any).x402Duration;
  const amount = (req as any).x402Amount;
  const paymentProof = (req as any).x402PaymentProof;

  res.json({
    success: true,
    message: "Compute access granted via x402 payment",
    provider: {
      address: req.params.providerAddress,
      gpuType: provider.gpuType,
      vramGB: provider.vramGB,
    },
    access: {
      durationSeconds: duration,
      pricePerSecond: provider.pricePerSecond,
      totalPrice: amount,
      priceInMOVE: amount / 100000000,
    },
    x402Payment: {
      verified: true,
      protocol: "x402",
      paymentProof,
      description: "Payment verified - dynamic pricing based on provider rate",
    },
    nextSteps: {
      message: "Use your wallet to create a job on-chain, then call /sync endpoints",
      endpoints: {
        createJob: "Sign transaction via wallet, then POST /api/v1/jobs/sync",
        depositEscrow: "Sign transaction via wallet, then POST /api/v1/escrow/sync",
        openStream: "Sign transaction via wallet, then POST /api/v1/payments/stream/sync",
      },
    },
  });
});

/**
 * POST /api/v1/compute/execute
 * Execute a compute job via x402 payment with DYNAMIC PRICING
 * 
 * Price is calculated based on:
 * - Provider's actual pricePerSecond
 * - Requested duration
 * 
 * Body:
 * {
 *   "providerAddress": "0x...",
 *   "dockerImage": "my-job:latest",
 *   "duration": 3600
 * }
 * 
 * Flow:
 * 1. Client makes request with provider and duration
 * 2. Server returns 402 with exact price (provider.pricePerSecond * duration)
 * 3. Client pays via wallet
 * 4. Client retries with payment proof header
 * 5. Server verifies and returns setup instructions
 */
router.post("/execute", x402ComputeExecute, async (req, res) => {
  // If we reach here, x402 payment was verified by middleware
  const provider = (req as any).x402Provider;
  const duration = (req as any).x402Duration;
  const amount = (req as any).x402Amount;
  const paymentProof = (req as any).x402PaymentProof;
  const { dockerImage } = req.body;

  res.json({
    success: true,
    message: "Compute access granted via x402 payment. Use wallet to complete setup.",
    x402Payment: {
      verified: true,
      protocol: "x402",
      paymentProof,
      paidAmount: amount,
      paidAmountMOVE: amount / 100000000,
      description: "Payment verified - dynamic pricing based on provider rate",
    },
    jobDetails: {
      providerAddress: req.body.providerAddress,
      dockerImage,
      duration,
      totalPrice: amount,
      totalPriceMOVE: amount / 100000000,
      pricePerSecond: provider.pricePerSecond,
      pricePerSecondMOVE: provider.pricePerSecond / 100000000,
    },
    walletInstructions: {
      step1: {
        action: "Create job on-chain",
        contractFunction: `${blockchainService.CONTRACT_ADDRESS}::job_registry::create_job`,
        args: ["providerAddress", "dockerImage", "escrowAmount", "maxDuration"],
        thenSync: "POST /api/v1/jobs/sync with { jobId, buyerAddress, providerAddress, dockerImage, escrowAmount, maxDuration, txHash }",
      },
      step2: {
        action: "Deposit escrow",
        contractFunction: `${blockchainService.CONTRACT_ADDRESS}::escrow::deposit_escrow`,
        args: ["jobId", "providerAddress", "amount"],
        thenSync: "POST /api/v1/escrow/sync with { jobId, buyerAddress, providerAddress, amount, txHash }",
      },
      step3: {
        action: "Open payment stream",
        contractFunction: `${blockchainService.CONTRACT_ADDRESS}::payment_stream::open_stream`,
        args: ["jobId", "payeeAddress", "ratePerSecond"],
        thenSync: "POST /api/v1/payments/stream/sync with { jobId, payerAddress, payeeAddress, ratePerSecond, txHash }",
      },
    },
  });
});

/**
 * GET /api/v1/compute/providers
 * List available compute providers
 * 
 * This endpoint is free (no x402 required) to browse providers.
 * Actual compute access requires x402 payment.
 * 
 * Query params:
 * - activeOnly: boolean (default: true)
 */
router.get("/providers", discoveryLimiter, async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly !== "false";
    const dbProviders = await providerRepository.findAll(activeOnly);

    const providers = dbProviders.map(p => ({
      address: p.address,
      gpuType: p.gpu_type,
      vramGB: p.vram_gb,
      pricePerSecond: Number(p.price_per_second),
      pricePerSecondMOVE: Number(p.price_per_second) / 100000000,
      isActive: p.is_active,
      reputationScore: p.reputation_score,
    }));

    res.json({
      success: true,
      message: "Browse available GPU providers",
      count: providers.length,
      providers,
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
 */
router.get("/x402-info", generalLimiter, (_req, res) => {
  res.json({
    success: true,
    hackathonSubmission: {
      challenge: "Best x402 App on Movement",
      prize: "$5,000",
      whyWeWin: {
        novelUse: "Not just a paywall - a compute marketplace for AI agents",
        dynamicPricing: "Prices are calculated based on provider's actual rate × duration",
        clearBenefits: [
          "AI agents can pay for GPU compute on-demand using x402",
          "Per-second micropayments enable pay-as-you-go compute",
          "Dynamic pricing based on actual provider rates",
          "Enables agentic internet infrastructure",
          "Providers get paid instantly via x402 payment streams",
        ],
        securityFirst: [
          "Server NEVER handles private keys",
          "All transactions signed by user's wallet",
          "Server only syncs database with on-chain state",
        ],
        revenueModel: {
          description: "Platform takes 2% fee on each x402 payment",
          scalability: "Scales with x402's instant settlement",
          example: "1000 AI agents × $0.10/compute = $100/day × 2% = $2/day platform revenue",
        },
        deployed: {
          network: "Movement Testnet",
          contractAddress: "0x69fa4604bbf4e835e978b4d7ef1cfe365f589291428a9d6332b6cd9f4e5e8ff1",
        },
      },
    },
    x402Integration: {
      protocol: "x402",
      description: "x402 payment rails enable instant micropayments for compute resources",
      dynamicPricing: {
        enabled: true,
        description: "Payment amount is calculated dynamically based on provider's pricePerSecond × duration",
        example: "Provider charges 0.001 MOVE/sec × 3600 sec = 3.6 MOVE total",
      },
      novelUseCase: {
        title: "Not just a paywall - a compute marketplace",
        description: [
          "AI agents can pay for GPU compute on-demand using x402",
          "Per-second micropayments for compute resources",
          "Dynamic pricing - each provider sets their own rate",
          "Enables agentic internet infrastructure",
          "Providers get paid instantly via x402 streams",
        ],
      },
      endpoints: {
        computeAccess: "GET /api/v1/compute/access/:providerAddress?duration=60 (dynamic x402 payment)",
        computeExecute: "POST /api/v1/compute/execute (dynamic x402 payment)",
        providers: "GET /api/v1/compute/providers (free, browse providers and their rates)",
      },
      benefits: {
        forAIAgents: [
          "No upfront costs - pay per use",
          "Instant payment via x402 protocol",
          "Fair pricing based on actual provider rates",
          "Access compute resources on-demand",
        ],
        forProviders: [
          "Set your own prices",
          "Instant payment settlement",
          "Per-second revenue stream",
          "No payment processing overhead",
        ],
        forPlatform: [
          "Novel use of x402 beyond simple paywalls",
          "Dynamic pricing marketplace",
          "Enables new business models",
          "Clear revenue path",
        ],
      },
    },
  });
});

export default router;

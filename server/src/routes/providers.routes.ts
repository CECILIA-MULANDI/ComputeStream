import express from "express";
import { ProviderService } from "../services/provider.service.js";
import { BlockchainService } from "../services/blockchain.service.js";
import { providerRepository } from "../../database/repositories/provider.repository.js";
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

/**
 * POST /api/v1/providers/sync
 * Sync a provider registration to the database after wallet-based registration
 * Called by frontend after successful on-chain registration via wallet
 * 
 * Body:
 * {
 *   "address": "0x...",           // Provider wallet address
 *   "txHash": "0x...",            // Transaction hash from wallet
 *   "gpuType": "RTX 4090",
 *   "vramGB": 24,
 *   "pricePerSecond": 1000000,    // In Octas
 *   "stakeAmount": 100000000      // In Octas
 * }
 */
router.post("/sync", strictLimiter, async (req, res) => {
  try {
    const { address, txHash, gpuType, vramGB, pricePerSecond, stakeAmount } = req.body;

    // Validate required fields
    if (!address || !gpuType || vramGB === undefined || !pricePerSecond || !stakeAmount) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["address", "gpuType", "vramGB", "pricePerSecond", "stakeAmount"],
      });
    }

    // Save to database
    await providerRepository.upsert({
      address,
      gpu_type: gpuType,
      vram_gb: Number(vramGB),
      price_per_second: BigInt(pricePerSecond),
      stake_amount: BigInt(stakeAmount),
      reputation_score: 100,
      is_active: true,
      total_jobs_completed: 0,
      total_earnings: 0n,
    });
    
    console.log(`✅ Provider ${address} synced to database (tx: ${txHash || 'N/A'})`);

    res.json({
      success: true,
      address,
      txHash,
      message: "Provider synced to database successfully",
    });
  } catch (error: any) {
    console.error("Provider sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync provider",
    });
  }
});

/**
 * @deprecated Use wallet signing + /sync endpoint instead
 * POST /api/v1/providers/register
 * Legacy endpoint - registers provider using private key (server-side)
 */
router.post("/register", veryStrictLimiter, async (req, res) => {
  try {
    const { privateKey, gpuType, vramGB, pricePerSecond, stakeAmount } = req.body;

    // Validate required fields
    if (!privateKey || !gpuType || vramGB === undefined || !pricePerSecond || !stakeAmount) {
      return res.status(400).json({
        error: "Missing required fields. Note: For wallet-based registration, use /sync endpoint instead.",
        required: ["privateKey", "gpuType", "vramGB", "pricePerSecond", "stakeAmount"],
      });
    }

    // Create account from private key
    const account = blockchainService.createAccountFromPrivateKey(privateKey);

    // Register provider on-chain
    const txnHash = await providerService.registerProvider(account, {
      gpuType,
      vramGB: Number(vramGB),
      pricePerSecond: Number(pricePerSecond),
      stakeAmount: Number(stakeAmount),
    });

    const providerAddress = account.accountAddress.toString();

    // Save to database
    await providerRepository.upsert({
      address: providerAddress,
      gpu_type: gpuType,
      vram_gb: Number(vramGB),
      price_per_second: BigInt(pricePerSecond),
      stake_amount: BigInt(stakeAmount),
      reputation_score: 100,
      is_active: true,
      total_jobs_completed: 0,
      total_earnings: 0n,
    });
    console.log(`✅ Provider ${providerAddress} saved to database`);

    res.json({
      success: true,
      transactionHash: txnHash,
      providerAddress,
      message: "Provider registered successfully",
    });
  } catch (error: any) {
    console.error("Provider registration error:", error);
    
    const statusCode = error.response?.status || error.statusCode || 500;
    const errorMessage = error.message || "Failed to register provider";
    
    res.status(statusCode).json({
      error: errorMessage,
      suggestion: "Consider using wallet signing + /sync endpoint for a more secure registration flow.",
    });
  }
});

/**
 * GET /api/v1/providers/min-stake
 * Get minimum stake amount required for registration
 */
router.get("/min-stake", discoveryLimiter, (_req, res) => {
  res.json({
    success: true,
    minStakeAmount: providerService.getMinStakeAmount(),
    minStakeAmountMOVE: providerService.getMinStakeAmount() / 100000000, // Convert to MOVE
  });
});

/**
 * GET /api/v1/providers/available
 * List only active providers
 */
router.get("/available", discoveryLimiter, async (_req, res) => {
  try {
    // Get active providers from database
    const providers = await providerRepository.findAll(true);

    res.json({
      success: true,
      count: providers.length,
      activeOnly: true,
      providers: providers.map(p => ({
        address: p.address,
        gpuType: p.gpu_type,
        vramGB: p.vram_gb,
        pricePerSecond: Number(p.price_per_second),
        pricePerSecondMOVE: Number(p.price_per_second) / 100000000,
        isActive: p.is_active,
        reputationScore: p.reputation_score,
      })),
    });
  } catch (error: any) {
    console.error("List available providers error:", error);
    res.status(500).json({
      error: error.message || "Failed to list available providers",
    });
  }
});

/**
 * GET /api/v1/providers
 * List all providers (discovery endpoint)
 * 
 * Query params:
 * - activeOnly: boolean (default: false) - only return active providers
 */
router.get("/", discoveryLimiter, async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly === "true";
    
    // Get providers from database
    const dbProviders = await providerRepository.findAll(activeOnly);
    
    const formattedProviders = dbProviders.map(p => ({
      address: p.address,
      gpuType: p.gpu_type,
      vramGB: p.vram_gb,
      pricePerSecond: Number(p.price_per_second),
      pricePerSecondMOVE: Number(p.price_per_second) / 100000000,
      isActive: p.is_active,
      reputationScore: p.reputation_score,
      totalJobsCompleted: p.total_jobs_completed,
      totalEarnings: p.total_earnings?.toString() || "0",
      registeredAt: p.created_at,
      lastSeenAt: p.last_seen_at,
    }));

    res.json({
      success: true,
      count: formattedProviders.length,
      activeOnly,
      providers: formattedProviders,
    });
  } catch (error: any) {
    console.error("List providers error:", error);
    res.status(500).json({
      error: error.message || "Failed to list providers",
    });
  }
});

/**
 * GET /api/v1/providers/:address
 * Get provider information
 */
router.get("/:address", generalLimiter, async (req, res) => {
  try {
    const { address } = req.params;

    if (!address) {
      return res.status(400).json({ error: "Provider address is required" });
    }

    const provider = await providerService.getProvider(address);

    res.json({
      success: true,
      provider: {
        address,
        ...provider,
      },
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get provider error:", error);
    res.status(500).json({ error: error.message || "Failed to get provider" });
  }
});

/**
 * GET /api/v1/providers/:address/active
 * Check if provider is active
 */
router.get("/:address/active", generalLimiter, async (req, res) => {
  try {
    const { address } = req.params;
    const isActive = await providerService.isProviderActive(address);

    res.json({
      success: true,
      address,
      isActive,
    });
  } catch (error: any) {
    console.error("Check provider active error:", error);
    res.status(500).json({ error: error.message || "Failed to check provider status" });
  }
});

/**
 * GET /api/v1/providers/:address/price
 * Get provider's price per second
 */
router.get("/:address/price", generalLimiter, async (req, res) => {
  try {
    const { address } = req.params;
    const pricePerSecond = await providerService.getProviderPrice(address);

    res.json({
      success: true,
      address,
      pricePerSecond,
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get provider price error:", error);
    res.status(500).json({ error: error.message || "Failed to get provider price" });
  }
});

/**
 * PATCH /api/v1/providers/:address/availability
 * Update provider availability
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key",
 *   "isActive": true
 * }
 */
router.patch("/:address/availability", strictLimiter, async (req, res) => {
  try {
    const { address } = req.params;
    const { privateKey, isActive } = req.body;

    if (!privateKey || isActive === undefined) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["privateKey", "isActive"],
      });
    }

    // Verify the address matches the private key
    const account = blockchainService.createAccountFromPrivateKey(privateKey);
    if (account.accountAddress.toString() !== address) {
      return res.status(403).json({ error: "Address does not match private key" });
    }

    const txnHash = await providerService.updateAvailability(account, isActive);

    // Update database
    await providerRepository.updateAvailability(address, isActive);

    res.json({
      success: true,
      transactionHash: txnHash,
      address,
      isActive,
    });
  } catch (error: any) {
    console.error("Update availability error:", error);
    res.status(500).json({ error: error.message || "Failed to update availability" });
  }
});

/**
 * PATCH /api/v1/providers/:address/pricing
 * Update provider pricing
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key",
 *   "pricePerSecond": 2000000
 * }
 */
router.patch("/:address/pricing", strictLimiter, async (req, res) => {
  try {
    const { address } = req.params;
    const { privateKey, pricePerSecond } = req.body;

    if (!privateKey || !pricePerSecond) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["privateKey", "pricePerSecond"],
      });
    }

    // Verify the address matches the private key
    const account = blockchainService.createAccountFromPrivateKey(privateKey);
    if (account.accountAddress.toString() !== address) {
      return res.status(403).json({ error: "Address does not match private key" });
    }

    const txnHash = await providerService.updatePricing(
      account,
      Number(pricePerSecond)
    );

    // Update database
    await providerRepository.updatePricing(address, BigInt(pricePerSecond));

    res.json({
      success: true,
      transactionHash: txnHash,
      address,
      pricePerSecond: Number(pricePerSecond),
    });
  } catch (error: any) {
    console.error("Update pricing error:", error);
    res.status(500).json({ error: error.message || "Failed to update pricing" });
  }
});

export default router;


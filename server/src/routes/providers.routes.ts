import express from "express";
import { ProviderService } from "../services/provider.service.js";
import { BlockchainService } from "../services/blockchain.service.js";
import { providerRepository } from "../../database/repositories/provider.repository.js";
import { 
  strictLimiter, 
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
 * POST /api/v1/providers/sync/availability
 * Sync provider availability update to database after wallet-based transaction
 * 
 * Body:
 * {
 *   "address": "0x...",
 *   "txHash": "0x...",
 *   "isActive": true
 * }
 */
router.post("/sync/availability", strictLimiter, async (req, res) => {
  try {
    const { address, txHash, isActive } = req.body;

    if (!address || isActive === undefined) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["address", "isActive"],
      });
    }

    // Update database
    await providerRepository.updateAvailability(address, isActive);
    
    console.log(`✅ Provider ${address} availability synced: ${isActive} (tx: ${txHash || 'N/A'})`);

    res.json({
      success: true,
      address,
      isActive,
      txHash,
      message: "Provider availability synced successfully",
    });
  } catch (error: any) {
    console.error("Provider availability sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync provider availability",
    });
  }
});

/**
 * POST /api/v1/providers/sync/pricing
 * Sync provider pricing update to database after wallet-based transaction
 * 
 * Body:
 * {
 *   "address": "0x...",
 *   "txHash": "0x...",
 *   "pricePerSecond": 2000000
 * }
 */
router.post("/sync/pricing", strictLimiter, async (req, res) => {
  try {
    const { address, txHash, pricePerSecond } = req.body;

    if (!address || !pricePerSecond) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["address", "pricePerSecond"],
      });
    }

    // Update database
    await providerRepository.updatePricing(address, BigInt(pricePerSecond));
    
    console.log(`✅ Provider ${address} pricing synced: ${pricePerSecond} (tx: ${txHash || 'N/A'})`);

    res.json({
      success: true,
      address,
      pricePerSecond: Number(pricePerSecond),
      txHash,
      message: "Provider pricing synced successfully",
    });
  } catch (error: any) {
    console.error("Provider pricing sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync provider pricing",
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
    minStakeAmountMOVE: providerService.getMinStakeAmount() / 100000000,
  });
});

/**
 * GET /api/v1/providers/available
 * List only active providers from database
 */
router.get("/available", discoveryLimiter, async (_req, res) => {
  try {
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
 * List all providers from database
 * 
 * Query params:
 * - activeOnly: boolean (default: false)
 */
router.get("/", discoveryLimiter, async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly === "true";
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
 * Get provider information from blockchain
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
 * Check if provider is active from blockchain
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
 * Get provider's price per second from blockchain
 */
router.get("/:address/price", generalLimiter, async (req, res) => {
  try {
    const { address } = req.params;
    const pricePerSecond = await providerService.getProviderPrice(address);

    res.json({
      success: true,
      address,
      pricePerSecond,
      pricePerSecondMOVE: pricePerSecond / 100000000,
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
 * GET /api/v1/providers/:address/stats
 * Get provider statistics from database
 */
router.get("/:address/stats", generalLimiter, async (req, res) => {
  try {
    const { address } = req.params;
    const stats = await providerRepository.getStats(address);

    if (!stats) {
      return res.status(404).json({ error: "Provider not found" });
    }

    res.json({
      success: true,
      address,
      stats,
    });
  } catch (error: any) {
    console.error("Get provider stats error:", error);
    res.status(500).json({ error: error.message || "Failed to get provider stats" });
  }
});

/**
 * GET /api/v1/providers/search/:gpuType
 * Search providers by GPU type from database
 */
router.get("/search/:gpuType", discoveryLimiter, async (req, res) => {
  try {
    const { gpuType } = req.params;
    const providers = await providerRepository.searchByGpuType(gpuType);

    res.json({
      success: true,
      searchTerm: gpuType,
      count: providers.length,
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
    console.error("Search providers error:", error);
    res.status(500).json({ error: error.message || "Failed to search providers" });
  }
});

export default router;

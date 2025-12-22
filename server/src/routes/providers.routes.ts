
import express from "express";
import { ProviderService } from "../services/provider.service.js";
import { BlockchainService } from "../services/blockchain.service.js";

const router = express.Router();

// Initialize services
const blockchainService = new BlockchainService();
const providerService = new ProviderService(blockchainService);

/**
 * POST /api/v1/providers/register
 * Register a new provider or update existing provider
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key",  // In production, use wallet signature
 *   "gpuType": "RTX 4090",
 *   "vramGB": 24,
 *   "pricePerSecond": 1000000,  // In Octas
 *   "stakeAmount": 100000000    // In Octas (min 0.1 MOVE)
 * }
 */
router.post("/register", async (req, res) => {
  try {
    const { privateKey, gpuType, vramGB, pricePerSecond, stakeAmount } = req.body;

    // Validate required fields
    if (!privateKey || !gpuType || vramGB === undefined || !pricePerSecond || !stakeAmount) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["privateKey", "gpuType", "vramGB", "pricePerSecond", "stakeAmount"],
      });
    }

    // Create account from private key
    // NOTE: In production, you'd verify a wallet signature instead of using private keys
    const account = blockchainService.createAccountFromPrivateKey(privateKey);

    // Register provider
    const txnHash = await providerService.registerProvider(account, {
      gpuType,
      vramGB: Number(vramGB),
      pricePerSecond: Number(pricePerSecond),
      stakeAmount: Number(stakeAmount),
    });

    res.json({
      success: true,
      transactionHash: txnHash,
      providerAddress: account.accountAddress.toString(),
      message: "Provider registered successfully",
    });
  } catch (error: any) {
    console.error("Provider registration error:", error);
    res.status(500).json({
      error: error.message || "Failed to register provider",
    });
  }
});

/**
 * GET /api/v1/providers/:address
 * Get provider information
 */
router.get("/:address", async (req, res) => {
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
router.get("/:address/active", async (req, res) => {
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
router.get("/:address/price", async (req, res) => {
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
router.patch("/:address/availability", async (req, res) => {
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
router.patch("/:address/pricing", async (req, res) => {
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

/**
 * GET /api/v1/providers/min-stake
 * Get minimum stake amount required for registration
 */
router.get("/min-stake", (_req, res) => {
  res.json({
    success: true,
    minStakeAmount: providerService.getMinStakeAmount(),
    minStakeAmountMOVE: providerService.getMinStakeAmount() / 100000000, // Convert to MOVE
  });
});

export default router;


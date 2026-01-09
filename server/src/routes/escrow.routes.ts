
import express from "express";
import { EscrowService } from "../services/escrow.service.js";
import { BlockchainService } from "../services/blockchain.service.js";
import { escrowRepository } from "../../database/repositories/escrow.repository.js";
import { 
  strictLimiter, 
  generalLimiter 
} from "../middleware/rate-limiter.middleware.js";

const router = express.Router();

// Initialize services
const blockchainService = new BlockchainService();
const escrowService = new EscrowService(blockchainService);

/**
 * POST /api/v1/escrow/sync
 * Sync escrow deposit to database after wallet-based transaction
 * Called by frontend after successful on-chain escrow deposit via wallet
 * 
 * Body:
 * {
 *   "txHash": "0x...",
 *   "jobId": 42,
 *   "buyerAddress": "0x...",
 *   "providerAddress": "0x...",
 *   "amount": 1000000000
 * }
 */
router.post("/sync", strictLimiter, async (req, res) => {
  try {
    const { txHash, jobId, buyerAddress, providerAddress, amount } = req.body;

    // Validate required fields
    if (jobId === undefined || !buyerAddress || !providerAddress || !amount) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["jobId", "buyerAddress", "providerAddress", "amount"],
      });
    }

    const amountBigInt = BigInt(amount);

    // Save to database
    await escrowRepository.upsert({
      job_id: Number(jobId),
      buyer_address: buyerAddress,
      provider_address: providerAddress,
      total_amount: amountBigInt,
      released_amount: 0n,
      remaining_amount: amountBigInt,
      is_active: true,
      transaction_hash: txHash,
    });

    console.log(`✅ Escrow for job ${jobId} synced to database (tx: ${txHash || 'N/A'})`);

    res.json({
      success: true,
      jobId: Number(jobId),
      buyerAddress,
      amount: amount.toString(),
      txHash,
      message: "Escrow synced to database successfully",
    });
  } catch (error: any) {
    console.error("Escrow sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync escrow",
    });
  }
});

/**
 * POST /api/v1/escrow/sync/release
 * Sync escrow payment release to database after wallet-based transaction
 * 
 * Body:
 * {
 *   "txHash": "0x...",
 *   "jobId": 42,
 *   "amount": 1000000
 * }
 */
router.post("/sync/release", strictLimiter, async (req, res) => {
  try {
    const { txHash, jobId, amount } = req.body;

    if (jobId === undefined || !amount) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["jobId", "amount"],
      });
    }

    // Update database
    await escrowRepository.releasePayment(Number(jobId), BigInt(amount));

    console.log(`✅ Escrow release for job ${jobId} synced: ${amount} (tx: ${txHash || 'N/A'})`);

    res.json({
      success: true,
      jobId: Number(jobId),
      amount: amount.toString(),
      txHash,
      message: "Escrow release synced successfully",
    });
  } catch (error: any) {
    console.error("Escrow release sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync escrow release",
    });
  }
});

/**
 * POST /api/v1/escrow/sync/close
 * Sync escrow closure to database after wallet-based transaction
 * 
 * Body:
 * {
 *   "txHash": "0x...",
 *   "jobId": 42,
 *   "refunded": true  // true if refunded, false if closed normally
 * }
 */
router.post("/sync/close", strictLimiter, async (req, res) => {
  try {
    const { txHash, jobId, refunded } = req.body;

    if (jobId === undefined) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["jobId"],
      });
    }

    // Update database
    if (refunded) {
      await escrowRepository.refundEscrow(Number(jobId));
    } else {
      await escrowRepository.closeEscrow(Number(jobId));
    }

    console.log(`✅ Escrow for job ${jobId} closed (refunded: ${refunded}) (tx: ${txHash || 'N/A'})`);

    res.json({
      success: true,
      jobId: Number(jobId),
      refunded: !!refunded,
      txHash,
      message: "Escrow closure synced successfully",
    });
  } catch (error: any) {
    console.error("Escrow close sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync escrow closure",
    });
  }
});

/**
 * GET /api/v1/escrow/:buyerAddress/:jobId
 * Get escrow information from blockchain
 */
router.get("/:buyerAddress/:jobId", generalLimiter, async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;

    if (!buyerAddress || !jobId) {
      return res.status(400).json({ error: "Buyer address and job ID are required" });
    }

    const escrow = await escrowService.getEscrow(buyerAddress, Number(jobId));

    res.json({
      success: true,
      escrow: {
        ...escrow,
        remainingBalance: escrow.totalAmount - escrow.releasedAmount,
      },
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get escrow error:", error);
    res.status(500).json({ error: error.message || "Failed to get escrow" });
  }
});

/**
 * GET /api/v1/escrow/:buyerAddress/:jobId/balance
 * Get remaining balance in escrow from blockchain
 */
router.get("/:buyerAddress/:jobId/balance", generalLimiter, async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const balance = await escrowService.getRemainingBalance(buyerAddress, Number(jobId));

    res.json({
      success: true,
      buyerAddress,
      jobId: Number(jobId),
      remainingBalance: balance,
      remainingBalanceMOVE: balance / 100000000,
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get escrow balance error:", error);
    res.status(500).json({ error: error.message || "Failed to get escrow balance" });
  }
});

/**
 * GET /api/v1/escrow/:buyerAddress/:jobId/released
 * Get released amount from escrow from blockchain
 */
router.get("/:buyerAddress/:jobId/released", generalLimiter, async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const released = await escrowService.getReleasedAmount(buyerAddress, Number(jobId));

    res.json({
      success: true,
      buyerAddress,
      jobId: Number(jobId),
      releasedAmount: released,
      releasedAmountMOVE: released / 100000000,
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get released amount error:", error);
    res.status(500).json({ error: error.message || "Failed to get released amount" });
  }
});

/**
 * GET /api/v1/escrow/:buyerAddress/:jobId/active
 * Check if escrow is active from blockchain
 */
router.get("/:buyerAddress/:jobId/active", generalLimiter, async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const isActive = await escrowService.isEscrowActive(buyerAddress, Number(jobId));

    res.json({
      success: true,
      buyerAddress,
      jobId: Number(jobId),
      isActive,
    });
  } catch (error: any) {
    console.error("Check escrow active error:", error);
    res.status(500).json({ error: error.message || "Failed to check escrow status" });
  }
});

/**
 * GET /api/v1/escrow/db/active
 * Get active escrows from database
 */
router.get("/db/active", generalLimiter, async (_req, res) => {
  try {
    const escrows = await escrowRepository.findActive();
    res.json({
      success: true,
      count: escrows.length,
      escrows,
    });
  } catch (error: any) {
    console.error("Get active escrows error:", error);
    res.status(500).json({ error: error.message || "Failed to get active escrows" });
  }
});

/**
 * GET /api/v1/escrow/db/buyer/:buyerAddress
 * Get escrows for a buyer from database
 */
router.get("/db/buyer/:buyerAddress", generalLimiter, async (req, res) => {
  try {
    const { buyerAddress } = req.params;
    const escrows = await escrowRepository.findByBuyer(buyerAddress);
    res.json({
      success: true,
      buyerAddress,
      count: escrows.length,
      escrows,
    });
  } catch (error: any) {
    console.error("Get buyer escrows error:", error);
    res.status(500).json({ error: error.message || "Failed to get buyer escrows" });
  }
});

export default router;

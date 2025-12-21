
import express from "express";
import { EscrowService } from "../services/escrow.service";
import { BlockchainService } from "../services/blockchain.service";

const router = express.Router();

// Initialize services
const blockchainService = new BlockchainService();
const escrowService = new EscrowService(blockchainService);

/**
 * POST /api/v1/escrow/deposit
 * Deposit escrow for a job - locks coins
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key",
 *   "jobId": 0,
 *   "providerAddress": "0x...",
 *   "amount": 1000000000
 * }
 */
router.post("/deposit", async (req, res) => {
  try {
    const { privateKey, jobId, providerAddress, amount } = req.body;

    // Validate required fields
    if (!privateKey || jobId === undefined || !providerAddress || !amount) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["privateKey", "jobId", "providerAddress", "amount"],
      });
    }

    // Create account from private key
    const buyer = blockchainService.createAccountFromPrivateKey(privateKey);

    // Deposit escrow
    const txnHash = await escrowService.depositEscrow(buyer, {
      jobId: Number(jobId),
      providerAddress,
      amount: Number(amount),
    });

    res.json({
      success: true,
      transactionHash: txnHash,
      buyerAddress: buyer.accountAddress.toString(),
      jobId: Number(jobId),
      amount: Number(amount),
      message: "Escrow deposited successfully",
    });
  } catch (error: any) {
    console.error("Deposit escrow error:", error);
    res.status(500).json({
      error: error.message || "Failed to deposit escrow",
    });
  }
});

/**
 * GET /api/v1/escrow/:buyerAddress/:jobId
 * Get escrow information
 */
router.get("/:buyerAddress/:jobId", async (req, res) => {
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
 * Get remaining balance in escrow
 */
router.get("/:buyerAddress/:jobId/balance", async (req, res) => {
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
 * Get released amount from escrow
 */
router.get("/:buyerAddress/:jobId/released", async (req, res) => {
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
 * Check if escrow is active
 */
router.get("/:buyerAddress/:jobId/active", async (req, res) => {
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
 * POST /api/v1/escrow/:buyerAddress/:jobId/release
 * Release payment to provider
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key",
 *   "amount": 1000000
 * }
 */
router.post("/:buyerAddress/:jobId/release", async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const { privateKey, amount } = req.body;

    if (!privateKey || !amount) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["privateKey", "amount"],
      });
    }

    // Verify the address matches the private key
    const buyer = blockchainService.createAccountFromPrivateKey(privateKey);
    if (buyer.accountAddress.toString() !== buyerAddress) {
      return res.status(403).json({ error: "Address does not match private key" });
    }

    const txnHash = await escrowService.releasePayment(
      buyer,
      Number(jobId),
      Number(amount)
    );

    res.json({
      success: true,
      transactionHash: txnHash,
      buyerAddress,
      jobId: Number(jobId),
      amount: Number(amount),
    });
  } catch (error: any) {
    console.error("Release payment error:", error);
    res.status(500).json({ error: error.message || "Failed to release payment" });
  }
});

/**
 * POST /api/v1/escrow/:buyerAddress/:jobId/refund
 * Refund remaining escrow to buyer (for cancelled/failed jobs)
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key"
 * }
 */
router.post("/:buyerAddress/:jobId/refund", async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const { privateKey } = req.body;

    if (!privateKey) {
      return res.status(400).json({ error: "Private key is required" });
    }

    // Verify the address matches the private key
    const buyer = blockchainService.createAccountFromPrivateKey(privateKey);
    if (buyer.accountAddress.toString() !== buyerAddress) {
      return res.status(403).json({ error: "Address does not match private key" });
    }

    const txnHash = await escrowService.refundEscrow(buyer, Number(jobId));

    res.json({
      success: true,
      transactionHash: txnHash,
      buyerAddress,
      jobId: Number(jobId),
    });
  } catch (error: any) {
    console.error("Refund escrow error:", error);
    res.status(500).json({ error: error.message || "Failed to refund escrow" });
  }
});

/**
 * POST /api/v1/escrow/:buyerAddress/:jobId/close
 * Close escrow and return any remaining funds (after job completion)
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key"
 * }
 */
router.post("/:buyerAddress/:jobId/close", async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const { privateKey } = req.body;

    if (!privateKey) {
      return res.status(400).json({ error: "Private key is required" });
    }

    // Verify the address matches the private key
    const buyer = blockchainService.createAccountFromPrivateKey(privateKey);
    if (buyer.accountAddress.toString() !== buyerAddress) {
      return res.status(403).json({ error: "Address does not match private key" });
    }

    const txnHash = await escrowService.closeEscrow(buyer, Number(jobId));

    res.json({
      success: true,
      transactionHash: txnHash,
      buyerAddress,
      jobId: Number(jobId),
    });
  } catch (error: any) {
    console.error("Close escrow error:", error);
    res.status(500).json({ error: error.message || "Failed to close escrow" });
  }
});

export default router;


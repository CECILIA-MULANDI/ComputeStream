// server/src/routes/payment-stream.routes.ts
import express from "express";
import { 
  strictLimiter, 
  generalLimiter 
} from "../middleware/rate-limiter.middleware.js";
import { PaymentStreamService } from "../services/payment-stream.service.js";
import { BlockchainService } from "../services/blockchain.service.js";
import { PaymentOrchestratorService } from "../services/payment-orchestrator.service.js";

const router = express.Router();

// Initialize services
const blockchainService = new BlockchainService();
const paymentStreamService = new PaymentStreamService(blockchainService);
const paymentOrchestrator = new PaymentOrchestratorService(
  blockchainService,
  paymentStreamService
);

// Export orchestrator for use in main server
export { paymentOrchestrator };

/**
 * POST /api/v1/payments/stream/open
 * Open a new payment stream
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key",
 *   "jobId": 0,
 *   "payeeAddress": "0x...",
 *   "ratePerSecond": 1000000,
 *   "startTime": 1234567890 (optional)
 * }
 */
router.post("/open", strictLimiter, async (req, res) => {
  try {
    const { privateKey, jobId, payeeAddress, ratePerSecond, startTime } = req.body;

    // Validate required fields
    if (!privateKey || jobId === undefined || !payeeAddress || !ratePerSecond) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["privateKey", "jobId", "payeeAddress", "ratePerSecond"],
      });
    }

    // Create account from private key
    const payer = blockchainService.createAccountFromPrivateKey(privateKey);

    // Open stream
    const txnHash = await paymentStreamService.openStream(payer, {
      jobId: Number(jobId),
      payeeAddress,
      ratePerSecond: Number(ratePerSecond),
      startTime: startTime ? Number(startTime) : undefined,
    });

    // Register stream with orchestrator for automatic processing
    paymentOrchestrator.registerStream(
      payer.accountAddress.toString(),
      Number(jobId),
      privateKey
    );

    res.json({
      success: true,
      transactionHash: txnHash,
      payerAddress: payer.accountAddress.toString(),
      jobId: Number(jobId),
      ratePerSecond: Number(ratePerSecond),
      message: "Payment stream opened successfully and registered for automatic processing",
    });
  } catch (error: any) {
    console.error("Open stream error:", error);
    res.status(500).json({
      error: error.message || "Failed to open payment stream",
    });
  }
});

/**
 * GET /api/v1/payments/stream/:payerAddress/:jobId
 * Get stream information
 */
router.get("/:payerAddress/:jobId", generalLimiter, async (req, res) => {
  try {
    const { payerAddress, jobId } = req.params;

    if (!payerAddress || !jobId) {
      return res.status(400).json({ error: "Payer address and job ID are required" });
    }

    const stream = await paymentStreamService.getStream(payerAddress, Number(jobId));

    // Calculate current amount including pending
    const currentTime = Math.floor(Date.now() / 1000);
    const currentAmount = await paymentStreamService.calculateCurrentAmount(
      payerAddress,
      Number(jobId),
      currentTime
    );

    res.json({
      success: true,
      stream: {
        ...stream,
        currentAmount,
        pendingAmount: currentAmount - stream.totalStreamed,
      },
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get stream error:", error);
    res.status(500).json({ error: error.message || "Failed to get stream" });
  }
});

/**
 * GET /api/v1/payments/stream/:payerAddress/:jobId/total
 * Get total amount streamed
 */
router.get("/:payerAddress/:jobId/total", generalLimiter, async (req, res) => {
  try {
    const { payerAddress, jobId } = req.params;
    const totalStreamed = await paymentStreamService.getTotalStreamed(
      payerAddress,
      Number(jobId)
    );

    res.json({
      success: true,
      payerAddress,
      jobId: Number(jobId),
      totalStreamed,
      totalStreamedMOVE: totalStreamed / 100000000,
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get total streamed error:", error);
    res.status(500).json({ error: error.message || "Failed to get total streamed" });
  }
});

/**
 * GET /api/v1/payments/stream/:payerAddress/:jobId/current
 * Calculate current amount (including pending)
 */
router.get("/:payerAddress/:jobId/current", generalLimiter, async (req, res) => {
  try {
    const { payerAddress, jobId } = req.params;
    const currentTime = Math.floor(Date.now() / 1000);
    const currentAmount = await paymentStreamService.calculateCurrentAmount(
      payerAddress,
      Number(jobId),
      currentTime
    );

    res.json({
      success: true,
      payerAddress,
      jobId: Number(jobId),
      currentAmount,
      currentAmountMOVE: currentAmount / 100000000,
      timestamp: currentTime,
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Calculate current amount error:", error);
    res.status(500).json({ error: error.message || "Failed to calculate current amount" });
  }
});

/**
 * GET /api/v1/payments/stream/:payerAddress/:jobId/active
 * Check if stream is active
 */
router.get("/:payerAddress/:jobId/active", generalLimiter, async (req, res) => {
  try {
    const { payerAddress, jobId } = req.params;
    const isActive = await paymentStreamService.isStreamActive(payerAddress, Number(jobId));

    res.json({
      success: true,
      payerAddress,
      jobId: Number(jobId),
      isActive,
    });
  } catch (error: any) {
    console.error("Check stream active error:", error);
    res.status(500).json({ error: error.message || "Failed to check stream status" });
  }
});

/**
 * POST /api/v1/payments/stream/:payerAddress/:jobId/process
 * Process payment (called by orchestrator)
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key",
 *   "currentTime": 1234567890 (optional)
 * }
 */
router.post("/:payerAddress/:jobId/process", strictLimiter, async (req, res) => {
  try {
    const { payerAddress, jobId } = req.params;
    const { privateKey, currentTime } = req.body;

    if (!privateKey) {
      return res.status(400).json({ error: "Private key is required" });
    }

    // Verify the address matches the private key
    const payer = blockchainService.createAccountFromPrivateKey(privateKey);
    if (payer.accountAddress.toString() !== payerAddress) {
      return res.status(403).json({ error: "Address does not match private key" });
    }

    const processTime = currentTime ? Number(currentTime) : Math.floor(Date.now() / 1000);
    const txnHash = await paymentStreamService.processPayment(
      payer,
      Number(jobId),
      processTime
    );

    res.json({
      success: true,
      transactionHash: txnHash,
      payerAddress,
      jobId: Number(jobId),
      processedAt: processTime,
    });
  } catch (error: any) {
    console.error("Process payment error:", error);
    res.status(500).json({ error: error.message || "Failed to process payment" });
  }
});

/**
 * POST /api/v1/payments/stream/:payerAddress/:jobId/close
 * Close stream (when job completes or fails)
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key",
 *   "finalTime": 1234567890 (optional)
 * }
 */
router.post("/:payerAddress/:jobId/close", strictLimiter, async (req, res) => {
  try {
    const { payerAddress, jobId } = req.params;
    const { privateKey, finalTime } = req.body;

    if (!privateKey) {
      return res.status(400).json({ error: "Private key is required" });
    }

    // Verify the address matches the private key
    const payer = blockchainService.createAccountFromPrivateKey(privateKey);
    if (payer.accountAddress.toString() !== payerAddress) {
      return res.status(403).json({ error: "Address does not match private key" });
    }

    const closeTime = finalTime ? Number(finalTime) : Math.floor(Date.now() / 1000);
    const txnHash = await paymentStreamService.closeStream(payer, Number(jobId), closeTime);

    // Unregister stream from orchestrator
    paymentOrchestrator.unregisterStream(payerAddress, Number(jobId));

    res.json({
      success: true,
      transactionHash: txnHash,
      payerAddress,
      jobId: Number(jobId),
      closedAt: closeTime,
    });
  } catch (error: any) {
    console.error("Close stream error:", error);
    res.status(500).json({ error: error.message || "Failed to close stream" });
  }
});

/**
 * POST /api/v1/payments/stream/:payerAddress/:jobId/pause
 * Pause stream (emergency stop)
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key",
 *   "pauseTime": 1234567890 (optional)
 * }
 */
router.post("/:payerAddress/:jobId/pause", strictLimiter, async (req, res) => {
  try {
    const { payerAddress, jobId } = req.params;
    const { privateKey, pauseTime } = req.body;

    if (!privateKey) {
      return res.status(400).json({ error: "Private key is required" });
    }

    // Verify the address matches the private key
    const payer = blockchainService.createAccountFromPrivateKey(privateKey);
    if (payer.accountAddress.toString() !== payerAddress) {
      return res.status(403).json({ error: "Address does not match private key" });
    }

    const pauseTimeValue = pauseTime ? Number(pauseTime) : Math.floor(Date.now() / 1000);
    const txnHash = await paymentStreamService.pauseStream(payer, Number(jobId), pauseTimeValue);

    // Unregister stream from orchestrator (paused streams don't need processing)
    paymentOrchestrator.unregisterStream(payerAddress, Number(jobId));

    res.json({
      success: true,
      transactionHash: txnHash,
      payerAddress,
      jobId: Number(jobId),
      pausedAt: pauseTimeValue,
    });
  } catch (error: any) {
    console.error("Pause stream error:", error);
    res.status(500).json({ error: error.message || "Failed to pause stream" });
  }
});

/**
 * POST /api/v1/payments/stream/:payerAddress/:jobId/resume
 * Resume stream
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key",
 *   "resumeTime": 1234567890 (optional)
 * }
 */
router.post("/:payerAddress/:jobId/resume", strictLimiter, async (req, res) => {
  try {
    const { payerAddress, jobId } = req.params;
    const { privateKey, resumeTime } = req.body;

    if (!privateKey) {
      return res.status(400).json({ error: "Private key is required" });
    }

    // Verify the address matches the private key
    const payer = blockchainService.createAccountFromPrivateKey(privateKey);
    if (payer.accountAddress.toString() !== payerAddress) {
      return res.status(403).json({ error: "Address does not match private key" });
    }

    const resumeTimeValue = resumeTime ? Number(resumeTime) : Math.floor(Date.now() / 1000);
    const txnHash = await paymentStreamService.resumeStream(
      payer,
      Number(jobId),
      resumeTimeValue
    );

    // Re-register stream with orchestrator (resumed streams need processing)
    paymentOrchestrator.registerStream(payerAddress, Number(jobId), privateKey);

    res.json({
      success: true,
      transactionHash: txnHash,
      payerAddress,
      jobId: Number(jobId),
      resumedAt: resumeTimeValue,
    });
  } catch (error: any) {
    console.error("Resume stream error:", error);
    res.status(500).json({ error: error.message || "Failed to resume stream" });
  }
});

/**
 * GET /api/v1/payments/stream/orchestrator/status
 * Get orchestrator status
 */
router.get("/orchestrator/status", generalLimiter, (_req, res) => {
  try {
    const status = paymentOrchestrator.getStatus();
    res.json({
      success: true,
      ...status,
    });
  } catch (error: any) {
    console.error("Get orchestrator status error:", error);
    res.status(500).json({ error: error.message || "Failed to get orchestrator status" });
  }
});

export default router;


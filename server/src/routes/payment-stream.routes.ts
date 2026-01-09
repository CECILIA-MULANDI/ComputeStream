// server/src/routes/payment-stream.routes.ts
import express from "express";
import { 
  strictLimiter, 
  generalLimiter 
} from "../middleware/rate-limiter.middleware.js";
import { PaymentStreamService } from "../services/payment-stream.service.js";
import { BlockchainService } from "../services/blockchain.service.js";
import { paymentStreamRepository } from "../../database/repositories/payment-stream.repository.js";

const router = express.Router();

// Initialize services
const blockchainService = new BlockchainService();
const paymentStreamService = new PaymentStreamService(blockchainService);

/**
 * POST /api/v1/payments/stream/sync
 * Sync payment stream to database after wallet-based transaction
 * Called by frontend after successful on-chain stream opening via wallet
 * 
 * Body:
 * {
 *   "txHash": "0x...",
 *   "jobId": 42,
 *   "payerAddress": "0x...",
 *   "payeeAddress": "0x...",
 *   "ratePerSecond": 1000000,
 *   "startTime": 1234567890
 * }
 */
router.post("/sync", strictLimiter, async (req, res) => {
  try {
    const { txHash, jobId, payerAddress, payeeAddress, ratePerSecond, startTime } = req.body;

    // Validate required fields
    if (jobId === undefined || !payerAddress || !payeeAddress || !ratePerSecond) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["jobId", "payerAddress", "payeeAddress", "ratePerSecond"],
      });
    }

    const now = startTime ? Number(startTime) : Math.floor(Date.now() / 1000);

    // Save to database
    await paymentStreamRepository.upsert({
      job_id: Number(jobId),
      payer_address: payerAddress,
      payee_address: payeeAddress,
      rate_per_second: BigInt(ratePerSecond),
      start_time: now,
      total_streamed: 0n,
      is_active: true,
      transaction_hash: txHash,
    });

    console.log(`✅ Payment stream for job ${jobId} synced to database (tx: ${txHash || 'N/A'})`);

    res.json({
      success: true,
      jobId: Number(jobId),
      payerAddress,
      payeeAddress,
      ratePerSecond: Number(ratePerSecond),
      txHash,
      message: "Payment stream synced to database successfully",
    });
  } catch (error: any) {
    console.error("Payment stream sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync payment stream",
    });
  }
});

/**
 * POST /api/v1/payments/stream/sync/payment
 * Sync a payment event to database after wallet-based transaction
 * Called by frontend after successful on-chain payment processing via wallet
 * 
 * Body:
 * {
 *   "txHash": "0x...",
 *   "jobId": 42,
 *   "amount": 1000000
 * }
 */
router.post("/sync/payment", strictLimiter, async (req, res) => {
  try {
    const { txHash, jobId, amount } = req.body;

    if (jobId === undefined || !amount) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["jobId", "amount"],
      });
    }

    // Update total streamed in database
    await paymentStreamRepository.updateStreamedAmount(Number(jobId), BigInt(amount));

    // Record payment event
    const stream = await paymentStreamRepository.findByJobId(Number(jobId));
    if (stream && stream.id) {
      await paymentStreamRepository.recordPaymentEvent({
        job_id: Number(jobId),
        stream_id: stream.id,
        amount: BigInt(amount),
        timestamp: new Date(),
        transaction_hash: txHash,
      });
    }

    console.log(`✅ Payment for job ${jobId} synced: ${amount} (tx: ${txHash || 'N/A'})`);

    res.json({
      success: true,
      jobId: Number(jobId),
      amount: amount.toString(),
      txHash,
      message: "Payment synced successfully",
    });
  } catch (error: any) {
    console.error("Payment sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync payment",
    });
  }
});

/**
 * POST /api/v1/payments/stream/sync/close
 * Sync stream closure to database after wallet-based transaction
 * 
 * Body:
 * {
 *   "txHash": "0x...",
 *   "jobId": 42,
 *   "endTime": 1234567890
 * }
 */
router.post("/sync/close", strictLimiter, async (req, res) => {
  try {
    const { txHash, jobId, endTime } = req.body;

    if (jobId === undefined) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["jobId"],
      });
    }

    const closeTime = endTime ? Number(endTime) : Math.floor(Date.now() / 1000);

    // Update database
    await paymentStreamRepository.closeStream(Number(jobId), closeTime);

    console.log(`✅ Payment stream for job ${jobId} closed (tx: ${txHash || 'N/A'})`);

    res.json({
      success: true,
      jobId: Number(jobId),
      endTime: closeTime,
      txHash,
      message: "Payment stream closure synced successfully",
    });
  } catch (error: any) {
    console.error("Payment stream close sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync stream closure",
    });
  }
});

/**
 * POST /api/v1/payments/stream/sync/pause
 * Sync stream pause to database after wallet-based transaction
 * 
 * Body:
 * {
 *   "txHash": "0x...",
 *   "jobId": 42
 * }
 */
router.post("/sync/pause", strictLimiter, async (req, res) => {
  try {
    const { txHash, jobId } = req.body;

    if (jobId === undefined) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["jobId"],
      });
    }

    // Update database
    await paymentStreamRepository.pauseStream(Number(jobId));

    console.log(`✅ Payment stream for job ${jobId} paused (tx: ${txHash || 'N/A'})`);

    res.json({
      success: true,
      jobId: Number(jobId),
      txHash,
      message: "Payment stream pause synced successfully",
    });
  } catch (error: any) {
    console.error("Payment stream pause sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync stream pause",
    });
  }
});

/**
 * POST /api/v1/payments/stream/sync/resume
 * Sync stream resume to database after wallet-based transaction
 * 
 * Body:
 * {
 *   "txHash": "0x...",
 *   "jobId": 42
 * }
 */
router.post("/sync/resume", strictLimiter, async (req, res) => {
  try {
    const { txHash, jobId } = req.body;

    if (jobId === undefined) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["jobId"],
      });
    }

    // Update database
    await paymentStreamRepository.resumeStream(Number(jobId));

    console.log(`✅ Payment stream for job ${jobId} resumed (tx: ${txHash || 'N/A'})`);

    res.json({
      success: true,
      jobId: Number(jobId),
      txHash,
      message: "Payment stream resume synced successfully",
    });
  } catch (error: any) {
    console.error("Payment stream resume sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync stream resume",
    });
  }
});

/**
 * GET /api/v1/payments/stream/:payerAddress/:jobId
 * Get stream information from blockchain
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
 * Get total amount streamed from blockchain
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
 * Calculate current amount (including pending) from blockchain
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
 * Check if stream is active from blockchain
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
 * GET /api/v1/payments/stream/db/active
 * Get active streams from database
 */
router.get("/db/active", generalLimiter, async (_req, res) => {
  try {
    const streams = await paymentStreamRepository.findActive();
    res.json({
      success: true,
      count: streams.length,
      streams,
    });
  } catch (error: any) {
    console.error("Get active streams error:", error);
    res.status(500).json({ error: error.message || "Failed to get active streams" });
  }
});

/**
 * GET /api/v1/payments/stream/db/stats
 * Get streaming statistics from database
 */
router.get("/db/stats", generalLimiter, async (_req, res) => {
  try {
    const stats = await paymentStreamRepository.getStreamingStats();
    res.json({
      success: true,
      stats: {
        ...stats,
        totalStreamedMOVE: Number(stats.totalStreamed) / 100000000,
      },
    });
  } catch (error: any) {
    console.error("Get streaming stats error:", error);
    res.status(500).json({ error: error.message || "Failed to get streaming stats" });
  }
});

/**
 * GET /api/v1/payments/stream/db/job/:jobId/events
 * Get payment events for a job from database
 */
router.get("/db/job/:jobId/events", generalLimiter, async (req, res) => {
  try {
    const { jobId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const events = await paymentStreamRepository.getPaymentEvents(Number(jobId), limit);
    res.json({
      success: true,
      jobId: Number(jobId),
      count: events.length,
      events,
    });
  } catch (error: any) {
    console.error("Get payment events error:", error);
    res.status(500).json({ error: error.message || "Failed to get payment events" });
  }
});

export default router;

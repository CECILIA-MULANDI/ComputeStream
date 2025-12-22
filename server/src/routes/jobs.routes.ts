
import express from "express";
import { JobService, JobStatus } from "../services/job.service.js";
import { BlockchainService } from "../services/blockchain.service.js";

const router = express.Router();

// Initialize services
const blockchainService = new BlockchainService();
const jobService = new JobService(blockchainService);

/**
 * POST /api/v1/jobs/create
 * Create a new job
 * 
 * Body:
 * {
 *   "privateKey": "hex_private_key",
 *   "providerAddress": "0x...",
 *   "dockerImage": "my-image:latest",
 *   "escrowAmount": 1000000000,
 *   "maxDuration": 3600
 * }
 */
router.post("/create", async (req, res) => {
  try {
    const { privateKey, providerAddress, dockerImage, escrowAmount, maxDuration } = req.body;

    // Validate required fields
    if (!privateKey || !providerAddress || !dockerImage || !escrowAmount || !maxDuration) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["privateKey", "providerAddress", "dockerImage", "escrowAmount", "maxDuration"],
      });
    }

    // Create account from private key
    const buyer = blockchainService.createAccountFromPrivateKey(privateKey);

    // Create job
    const txnHash = await jobService.createJob(buyer, {
      providerAddress,
      dockerImage,
      escrowAmount: Number(escrowAmount),
      maxDuration: Number(maxDuration),
    });

    res.json({
      success: true,
      transactionHash: txnHash,
      buyerAddress: buyer.accountAddress.toString(),
      message: "Job created successfully",
    });
  } catch (error: any) {
    console.error("Create job error:", error);
    res.status(500).json({
      error: error.message || "Failed to create job",
    });
  }
});

/**
 * GET /api/v1/jobs/:buyerAddress/:jobId
 * Get job information
 */
router.get("/:buyerAddress/:jobId", async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;

    if (!buyerAddress || !jobId) {
      return res.status(400).json({ error: "Buyer address and job ID are required" });
    }

    const job = await jobService.getJob(buyerAddress, Number(jobId));

    res.json({
      success: true,
      job: {
        ...job,
        statusName: jobService.getStatusName(job.status),
      },
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get job error:", error);
    res.status(500).json({ error: error.message || "Failed to get job" });
  }
});

/**
 * GET /api/v1/jobs/:buyerAddress/:jobId/status
 * Get job status
 */
router.get("/:buyerAddress/:jobId/status", async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const status = await jobService.getJobStatus(buyerAddress, Number(jobId));

    res.json({
      success: true,
      buyerAddress,
      jobId: Number(jobId),
      status,
      statusName: jobService.getStatusName(status),
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get job status error:", error);
    res.status(500).json({ error: error.message || "Failed to get job status" });
  }
});

/**
 * POST /api/v1/jobs/:buyerAddress/:jobId/start
 * Start a job (provider only)
 * 
 * Body:
 * {
 *   "privateKey": "provider_private_key"
 * }
 */
router.post("/:buyerAddress/:jobId/start", async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const { privateKey } = req.body;

    if (!privateKey) {
      return res.status(400).json({ error: "Private key is required" });
    }

    const provider = blockchainService.createAccountFromPrivateKey(privateKey);
    const startTime = Math.floor(Date.now() / 1000);

    const txnHash = await jobService.startJob(
      provider,
      buyerAddress,
      Number(jobId),
      startTime
    );

    res.json({
      success: true,
      transactionHash: txnHash,
      buyerAddress,
      jobId: Number(jobId),
      startTime,
    });
  } catch (error: any) {
    console.error("Start job error:", error);
    res.status(500).json({ error: error.message || "Failed to start job" });
  }
});

/**
 * POST /api/v1/jobs/:buyerAddress/:jobId/complete
 * Complete a job (provider only)
 * 
 * Body:
 * {
 *   "privateKey": "provider_private_key",
 *   "outputUrl": "https://..."
 * }
 */
router.post("/:buyerAddress/:jobId/complete", async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const { privateKey, outputUrl } = req.body;

    if (!privateKey || !outputUrl) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["privateKey", "outputUrl"],
      });
    }

    const provider = blockchainService.createAccountFromPrivateKey(privateKey);
    const endTime = Math.floor(Date.now() / 1000);

    const txnHash = await jobService.completeJob(
      provider,
      buyerAddress,
      Number(jobId),
      outputUrl,
      endTime
    );

    res.json({
      success: true,
      transactionHash: txnHash,
      buyerAddress,
      jobId: Number(jobId),
      outputUrl,
      endTime,
    });
  } catch (error: any) {
    console.error("Complete job error:", error);
    res.status(500).json({ error: error.message || "Failed to complete job" });
  }
});

/**
 * POST /api/v1/jobs/:buyerAddress/:jobId/fail
 * Fail a job (buyer or provider)
 * 
 * Body:
 * {
 *   "privateKey": "private_key"
 * }
 */
router.post("/:buyerAddress/:jobId/fail", async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const { privateKey } = req.body;

    if (!privateKey) {
      return res.status(400).json({ error: "Private key is required" });
    }

    const account = blockchainService.createAccountFromPrivateKey(privateKey);
    const endTime = Math.floor(Date.now() / 1000);

    const txnHash = await jobService.failJob(
      account,
      buyerAddress,
      Number(jobId),
      endTime
    );

    res.json({
      success: true,
      transactionHash: txnHash,
      buyerAddress,
      jobId: Number(jobId),
      endTime,
    });
  } catch (error: any) {
    console.error("Fail job error:", error);
    res.status(500).json({ error: error.message || "Failed to fail job" });
  }
});

/**
 * POST /api/v1/jobs/:buyerAddress/:jobId/cancel
 * Cancel a job (buyer only, only if pending)
 * 
 * Body:
 * {
 *   "privateKey": "buyer_private_key"
 * }
 */
router.post("/:buyerAddress/:jobId/cancel", async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const { privateKey } = req.body;

    if (!privateKey) {
      return res.status(400).json({ error: "Private key is required" });
    }

    const buyer = blockchainService.createAccountFromPrivateKey(privateKey);

    // Verify buyer address matches
    if (buyer.accountAddress.toString() !== buyerAddress) {
      return res.status(403).json({ error: "Address does not match private key" });
    }

    const txnHash = await jobService.cancelJob(buyer, Number(jobId));

    res.json({
      success: true,
      transactionHash: txnHash,
      buyerAddress,
      jobId: Number(jobId),
    });
  } catch (error: any) {
    console.error("Cancel job error:", error);
    res.status(500).json({ error: error.message || "Failed to cancel job" });
  }
});

/**
 * GET /api/v1/jobs/:buyerAddress/:jobId/duration
 * Get job duration
 */
router.get("/:buyerAddress/:jobId/duration", async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const duration = await jobService.getJobDuration(buyerAddress, Number(jobId));

    res.json({
      success: true,
      buyerAddress,
      jobId: Number(jobId),
      duration,
      durationMinutes: Math.floor(duration / 60),
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get job duration error:", error);
    res.status(500).json({ error: error.message || "Failed to get job duration" });
  }
});

/**
 * GET /api/v1/jobs/:buyerAddress/:jobId/output
 * Get job output URL
 */
router.get("/:buyerAddress/:jobId/output", async (req, res) => {
  try {
    const { buyerAddress, jobId } = req.params;
    const outputUrl = await jobService.getJobOutputUrl(buyerAddress, Number(jobId));

    res.json({
      success: true,
      buyerAddress,
      jobId: Number(jobId),
      outputUrl,
    });
  } catch (error: any) {
    if (error.message.includes("not found")) {
      return res.status(404).json({ error: error.message });
    }
    console.error("Get job output error:", error);
    res.status(500).json({ error: error.message || "Failed to get job output" });
  }
});

export default router;



import express from "express";
import { JobService } from "../services/job.service.js";
import { BlockchainService } from "../services/blockchain.service.js";
import { jobRepository } from "../../database/repositories/job.repository.js";
import { 
  strictLimiter, 
  generalLimiter 
} from "../middleware/rate-limiter.middleware.js";

const router = express.Router();

// Initialize services
const blockchainService = new BlockchainService();
const jobService = new JobService(blockchainService);

/**
 * POST /api/v1/jobs/sync
 * Sync a job to the database after wallet-based creation
 * Called by frontend after successful on-chain job creation via wallet
 * 
 * Body:
 * {
 *   "txHash": "0x...",
 *   "jobId": 42,
 *   "buyerAddress": "0x...",
 *   "providerAddress": "0x...",
 *   "dockerImage": "my-image:latest",
 *   "escrowAmount": 1000000000,
 *   "maxDuration": 3600
 * }
 */
router.post("/sync", strictLimiter, async (req, res) => {
  try {
    const { txHash, jobId, buyerAddress, providerAddress, dockerImage, escrowAmount, maxDuration } = req.body;

    // Validate required fields (jobId is optional - we'll try to extract it)
    if (!buyerAddress || !providerAddress || !dockerImage || !txHash) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["txHash", "buyerAddress", "providerAddress", "dockerImage"],
        optional: ["jobId"], // Will be extracted from blockchain if not provided
      });
    }
    
    // If jobId not provided, try to extract it from the blockchain
    let finalJobId = jobId;
    if (!finalJobId && txHash) {
      console.log(`⚠️  No jobId provided, attempting to extract from blockchain...`);
      
      try {
        // Wait a moment for transaction to be indexed
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try to get the job counter from blockchain
        // The jobId will be the counter value at the time of creation
        // Since the counter increments after job creation, we need to check recent jobs
        
        // Get current job counter
        const currentCounter = await jobService.getJobCounter();
        console.log(`Current job counter: ${currentCounter}`);
        
        // The jobId should be currentCounter - 1 (since counter increments after creation)
        // But we need to verify by checking if a job with that ID exists for this buyer
        let foundJobId = null;
        
        // Try checking a range around the current counter
        for (let checkId = currentCounter; checkId >= Math.max(0, currentCounter - 10); checkId--) {
          try {
            const job = await jobService.getJob(buyerAddress, checkId);
            if (job && job.buyerAddress.toLowerCase() === buyerAddress.toLowerCase()) {
              // Verify it matches our transaction
              // We can't easily verify txHash from the job data, but if buyer and provider match, it's likely correct
              if (job.providerAddress.toLowerCase() === providerAddress.toLowerCase()) {
                foundJobId = checkId;
                console.log(`✅ Found matching job with ID: ${foundJobId}`);
                break;
              }
            }
          } catch (e) {
            // Job doesn't exist with this ID, continue searching
            continue;
          }
        }
        
        if (foundJobId !== null) {
          finalJobId = foundJobId;
        } else {
          // If we can't find it, use currentCounter - 1 as a best guess
          // (counter increments after job creation, so the new job should be counter - 1)
          finalJobId = Math.max(0, currentCounter - 1);
          console.log(`⚠️  Could not verify jobId, using estimated ID: ${finalJobId}`);
        }
      } catch (error: any) {
        console.error(`Failed to extract jobId from blockchain:`, error.message);
        // If extraction fails, we'll still try to save with a placeholder
        // The user can manually update it later, or an indexer can fix it
        console.log(`⚠️  Will attempt to save job without verified jobId`);
      }
    }

    // Save to database
    // Normalize addresses to lowercase for consistent storage and retrieval
    const normalizedBuyerAddress = buyerAddress.toLowerCase();
    const normalizedProviderAddress = providerAddress.toLowerCase();
    
    if (finalJobId !== null && finalJobId !== undefined) {
      try {
        await jobRepository.upsert({
          job_id: Number(finalJobId),
          buyer_address: normalizedBuyerAddress,
          provider_address: normalizedProviderAddress,
          docker_image: dockerImage,
          status: 'pending',
          escrow_amount: BigInt(escrowAmount || 0),
          max_duration: Number(maxDuration || 0),
          transaction_hash: txHash,
        });
        console.log(`✅ Job ${finalJobId} synced to database (tx: ${txHash})`);
        console.log(`   Buyer: ${normalizedBuyerAddress}, Provider: ${normalizedProviderAddress}`);
      } catch (dbError: any) {
        // If there's a conflict (job already exists), that's okay
        if (dbError.message?.includes('duplicate') || dbError.message?.includes('unique')) {
          console.log(`ℹ️  Job ${finalJobId} already exists in database, skipping insert`);
        } else {
          throw dbError;
        }
      }
    } else {
      console.log(`⚠️  Could not determine jobId, job not saved to database. Transaction: ${txHash}`);
      console.log(`   Please manually sync this job once the jobId is known, or wait for indexer.`);
    }

    res.json({
      success: true,
      jobId: finalJobId ? Number(finalJobId) : null,
      buyerAddress,
      txHash,
      message: finalJobId 
        ? "Job synced to database successfully" 
        : "Could not determine jobId. The job may need to be synced manually once the jobId is available.",
    });
  } catch (error: any) {
    console.error("Job sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync job",
    });
  }
});

/**
 * POST /api/v1/jobs/sync/status
 * Sync job status update to database after wallet-based transaction
 * 
 * Body:
 * {
 *   "txHash": "0x...",
 *   "jobId": 42,
 *   "status": "running" | "completed" | "failed" | "cancelled",
 *   "startTime": 1234567890,
 *   "endTime": 1234567890,
 *   "outputUrl": "https://..."
 * }
 */
router.post("/sync/status", strictLimiter, async (req, res) => {
  try {
    const { txHash, jobId, status, startTime, endTime, outputUrl } = req.body;

    if (jobId === undefined || !status) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["jobId", "status"],
      });
    }

    // Update database based on status
    if (status === 'running' && startTime) {
      await jobRepository.startJob(Number(jobId), Number(startTime));
    } else if (status === 'completed' && endTime) {
      await jobRepository.completeJob(Number(jobId), Number(endTime), outputUrl);
    } else if (status === 'failed' && endTime) {
      await jobRepository.failJob(Number(jobId), Number(endTime));
    } else if (status === 'cancelled') {
      await jobRepository.cancelJob(Number(jobId));
    } else {
      await jobRepository.updateStatus(Number(jobId), status);
    }

    console.log(`✅ Job ${jobId} status synced: ${status} (tx: ${txHash || 'N/A'})`);

    res.json({
      success: true,
      jobId: Number(jobId),
      status,
      txHash,
      message: "Job status synced successfully",
    });
  } catch (error: any) {
    console.error("Job status sync error:", error);
    res.status(500).json({
      error: error.message || "Failed to sync job status",
    });
  }
});

/**
 * GET /api/v1/jobs/:buyerAddress/:jobId
 * Get job information from blockchain
 */
router.get("/:buyerAddress/:jobId", generalLimiter, async (req, res) => {
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
 * Get job status from blockchain
 */
router.get("/:buyerAddress/:jobId/status", generalLimiter, async (req, res) => {
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
 * GET /api/v1/jobs/:buyerAddress/:jobId/duration
 * Get job duration from blockchain
 */
router.get("/:buyerAddress/:jobId/duration", generalLimiter, async (req, res) => {
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
 * Get job output URL from blockchain
 */
router.get("/:buyerAddress/:jobId/output", generalLimiter, async (req, res) => {
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

/**
 * GET /api/v1/jobs/db/active
 * Get active jobs from database
 */
router.get("/db/active", generalLimiter, async (_req, res) => {
  try {
    const jobs = await jobRepository.findActive();
    res.json({
      success: true,
      count: jobs.length,
      jobs,
    });
  } catch (error: any) {
    console.error("Get active jobs error:", error);
    res.status(500).json({ error: error.message || "Failed to get active jobs" });
  }
});

/**
 * GET /api/v1/jobs/db/buyer/:buyerAddress
 * Get jobs for a buyer from database
 */
router.get("/db/buyer/:buyerAddress", generalLimiter, async (req, res) => {
  try {
    const { buyerAddress } = req.params;
    console.log(`📋 Fetching jobs for buyer: ${buyerAddress}`);
    
    const jobs = await jobRepository.findByBuyer(buyerAddress);
    console.log(`   Found ${jobs.length} jobs in database`);
    
    // Transform database fields (snake_case) to frontend format (camelCase)
    const transformedJobs = jobs.map((job: any) => ({
      jobId: job.job_id,
      buyerAddress: job.buyer_address,
      providerAddress: job.provider_address,
      dockerImage: job.docker_image,
      status: job.status,
      escrowAmount: Number(job.escrow_amount || 0),
      maxDuration: job.max_duration || 0,
      startTime: job.start_time ? Number(job.start_time) : undefined,
      endTime: job.end_time ? Number(job.end_time) : undefined,
      outputUrl: job.output_url || undefined,
    }));
    
    console.log(`   Returning ${transformedJobs.length} transformed jobs`);
    
    res.json({
      success: true,
      buyerAddress,
      count: transformedJobs.length,
      jobs: transformedJobs,
    });
  } catch (error: any) {
    console.error("Get buyer jobs error:", error);
    res.status(500).json({ error: error.message || "Failed to get buyer jobs" });
  }
});

/**
 * GET /api/v1/jobs/db/provider/:providerAddress
 * Get jobs for a provider from database
 */
router.get("/db/provider/:providerAddress", generalLimiter, async (req, res) => {
  try {
    const { providerAddress } = req.params;
    const jobs = await jobRepository.findByProvider(providerAddress);
    res.json({
      success: true,
      providerAddress,
      count: jobs.length,
      jobs,
    });
  } catch (error: any) {
    console.error("Get provider jobs error:", error);
    res.status(500).json({ error: error.message || "Failed to get provider jobs" });
  }
});

export default router;

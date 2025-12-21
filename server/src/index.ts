import express from "express";
import cors from "cors";
import { x402Paywall } from "x402plus";
import "dotenv/config";
import providerRoutes from "./routes/providers.routes";
import jobRoutes from "./routes/jobs.routes";
import escrowRoutes from "./routes/escrow.routes";
import paymentStreamRoutes, { paymentOrchestrator } from "./routes/payment-stream.routes";
import x402ComputeRoutes from "./routes/x402-compute.routes";

const app = express();
const PORT = process.env.PORT || 4402;

app.use(cors({
  origin: "http://localhost:3000",
  exposedHeaders: ["X-PAYMENT-RESPONSE"]
}));

// x402 Paywall middleware - Novel use: Compute resource access via x402
// This enables AI agents to pay for GPU compute on-demand using x402 payment rails
app.use(
  x402Paywall(
    process.env.MOVEMENT_PAY_TO as string,
    {
      // Premium content (example)
      "GET /api/premium-content": {
        network: "movement",
        asset: "0x1::aptos_coin::AptosCoin",
        maxAmountRequired: "100000000", // 1 MOVE
        description: "Premium workshop content",
        mimeType: "application/json",
        maxTimeoutSeconds: 600
      },
      // Compute resource access - NOVEL USE CASE
      // AI agents can pay for GPU compute access via x402
      "GET /api/v1/compute/access/:providerAddress": {
        network: "movement",
        asset: "0x1::aptos_coin::AptosCoin",
        maxAmountRequired: "1000000000", // 10 MOVE (will be calculated dynamically)
        description: "GPU compute resource access - Pay-per-use compute for AI agents",
        mimeType: "application/json",
        maxTimeoutSeconds: 300
      },
      // Job execution endpoint - requires x402 payment
      "POST /api/v1/compute/execute": {
        network: "movement",
        asset: "0x1::aptos_coin::AptosCoin",
        maxAmountRequired: "5000000000", // 50 MOVE (estimated for job execution)
        description: "Execute compute job - x402 enables instant payment for compute",
        mimeType: "application/json",
        maxTimeoutSeconds: 600
      }
    },
    {
      url: "https://facilitator.stableyard.fi"
    }
  )
);

// Parse JSON bodies
app.use(express.json());

// API Routes
app.use("/api/v1/providers", providerRoutes);
app.use("/api/v1/jobs", jobRoutes);
app.use("/api/v1/escrow", escrowRoutes);
app.use("/api/v1/payments/stream", paymentStreamRoutes);

// x402-Enabled Compute Routes (NOVEL USE CASE)
// These endpoints demonstrate x402 beyond simple paywalls
app.use("/api/v1/compute", x402ComputeRoutes);

// Premium content endpoint (protected by x402 paywall)
app.get("/api/premium-content", (_req, res) => {
  res.redirect("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    message: "ComputeStream API",
    version: "1.0.0",
    endpoints: {
      providers: "/api/v1/providers",
      jobs: "/api/v1/jobs",
      escrow: "/api/v1/escrow",
      paymentStreams: "/api/v1/payments/stream",
      x402Compute: "/api/v1/compute", // Novel x402 use case
      health: "/health",
    },
  });
});

app.listen(PORT, () => {
  console.log(`🚀 ComputeStream API running at http://localhost:${PORT}`);
  console.log(`📡 Movement RPC: ${process.env.MOVEMENT_RPC_URL || "NOT SET"}`);
  console.log(`📝 Contract: ${process.env.CONTRACT_ADDRESS || "0xd6d9d27d944417f05fd2d2d84900ff379d0b7d7d00811bfe08ceedf0e64288b9"}`);
  console.log(`💰 Pay-to address: ${process.env.MOVEMENT_PAY_TO || "NOT SET"}`);
  
  // Start payment stream orchestrator
  paymentOrchestrator.start();
  console.log(`💸 Payment stream orchestrator started`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  paymentOrchestrator.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down gracefully...");
  paymentOrchestrator.stop();
  process.exit(0);
});

import express from "express";
import cors from "cors";
import { x402Paywall } from "x402plus";
import "dotenv/config";
import providerRoutes from "./routes/providers.routes.js";
import jobRoutes from "./routes/jobs.routes.js";
import escrowRoutes from "./routes/escrow.routes.js";
import paymentStreamRoutes, { paymentOrchestrator } from "./routes/payment-stream.routes.js";
import x402ComputeRoutes from "./routes/x402-compute.routes.js";
import { generalLimiter } from "./middleware/rate-limiter.middleware.js";
import { indexerService } from "./services/indexer.service.js";
import { testConnection } from "../database/connection.js";

// Validate required environment variables
const requiredEnvVars = ["MOVEMENT_RPC_URL", "MOVEMENT_PAY_TO"];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingEnvVars.forEach((key) => console.error(`   - ${key}`));
  console.error("\nPlease set these in your .env file or environment.");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4402;

// CORS configuration - configurable via environment
const corsOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(",").map(s => s.trim())
  : ["http://localhost:3000", "http://localhost:5173"];

app.use(cors({
  origin: corsOrigins,
  // Support both v1 (X-PAYMENT-RESPONSE) and v2 (PAYMENT-RESPONSE) headers
  exposedHeaders: ["X-PAYMENT-RESPONSE", "PAYMENT-RESPONSE", "PAYMENT-REQUIRED"]
}));

// Global rate limiting for production
app.use(generalLimiter);

// x402 Paywall - Novel use: Compute resource access via x402
// This enables AI agents to pay for GPU compute on-demand using x402 payment rails
// Using x402plus for simpler Movement Network integration
app.use(
  x402Paywall(
    process.env.MOVEMENT_PAY_TO as string,
    {
      "GET /api/premium-content": {
        network: "movement",
        asset: "0x1::aptos_coin::AptosCoin",
        maxAmountRequired: "100000000",
        description: "Premium workshop content",
        mimeType: "application/json",
        maxTimeoutSeconds: 600
      },
      "GET /api/v1/compute/access/:providerAddress": {
        network: "movement",
        asset: "0x1::aptos_coin::AptosCoin",
        maxAmountRequired: "1000000000",
        description: "GPU compute resource access",
        mimeType: "application/json",
        maxTimeoutSeconds: 300
      },
      "POST /api/v1/compute/execute": {
        network: "movement",
        asset: "0x1::aptos_coin::AptosCoin",
        maxAmountRequired: "5000000000",
        description: "Execute compute job - x402 payment",
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

app.listen(PORT, async () => {
  console.log(`🚀 ComputeStream API running at http://localhost:${PORT}`);
  console.log(`📡 Movement RPC: ${process.env.MOVEMENT_RPC_URL || "NOT SET"}`);
  console.log(`📝 Contract: 0x69fa4604bbf4e835e978b4d7ef1cfe365f589291428a9d6332b6cd9f4e5e8ff1`);
  console.log(`💰 Pay-to address: ${process.env.MOVEMENT_PAY_TO || "NOT SET"}`);
  console.log(`🌐 CORS origins: ${corsOrigins.join(", ")}`);
  console.log(`🛡️  Rate limiting: enabled`);
  
  // Test database connection
  const dbConnected = await testConnection();
  if (dbConnected) {
    console.log(`🗄️  Database: connected`);
    
    // Start blockchain indexer
    await indexerService.start();
    console.log(`🔍 Blockchain indexer started`);
  } else {
    console.warn(`⚠️  Database not connected - running without persistence`);
  }
  
  // Start payment stream orchestrator
  paymentOrchestrator.start();
  console.log(`💸 Payment stream orchestrator started`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  paymentOrchestrator.stop();
  indexerService.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down gracefully...");
  paymentOrchestrator.stop();
  indexerService.stop();
  process.exit(0);
});

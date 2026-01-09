import express from "express";
import cors from "cors";
import { x402Paywall } from "x402plus";
import "dotenv/config";
import providerRoutes from "./routes/providers.routes.js";
import jobRoutes from "./routes/jobs.routes.js";
import escrowRoutes from "./routes/escrow.routes.js";
import paymentStreamRoutes from "./routes/payment-stream.routes.js";
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

// x402 Paywall for static-priced endpoints only
// Compute routes use dynamic pricing middleware (see x402-compute.routes.ts)
app.use(
  x402Paywall(
    process.env.MOVEMENT_PAY_TO as string,
    {
      "GET /api/premium-content": {
        network: "movement",
        asset: "0x1::aptos_coin::AptosCoin",
        maxAmountRequired: "100000000", // 1 MOVE
        description: "Premium workshop content",
        mimeType: "application/json",
        maxTimeoutSeconds: 600
      }
      // NOTE: Compute routes removed - they use dynamic pricing based on provider rates
      // See x402-compute.routes.ts for implementation
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
    security: "Server NEVER handles private keys - all transactions signed via wallet",
    endpoints: {
      providers: "/api/v1/providers",
      jobs: "/api/v1/jobs",
      escrow: "/api/v1/escrow",
      paymentStreams: "/api/v1/payments/stream",
      x402Compute: "/api/v1/compute",
      health: "/health",
    },
  });
});

app.listen(PORT, async () => {
  console.log(`🚀 ComputeStream API running at http://localhost:${PORT}`);
  console.log(`🔐 Security: Server NEVER handles private keys`);
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
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  indexerService.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Shutting down gracefully...");
  indexerService.stop();
  process.exit(0);
});

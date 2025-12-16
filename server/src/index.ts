import express from "express";
import cors from "cors";
import { x402Paywall } from "x402plus";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 4402;

app.use(cors({
  origin: "http://localhost:3000",
  exposedHeaders: ["X-PAYMENT-RESPONSE"]
}));

app.use(
  x402Paywall(
    process.env.MOVEMENT_PAY_TO as string,
    {
      "GET /api/premium-content": {
        network: "movement",  // Try mainnet to test if facilitator supports it
        asset: "0x1::aptos_coin::AptosCoin",
        maxAmountRequired: "100000000", // 1 MOVE
        description: "Premium workshop content",
        mimeType: "application/json",
        maxTimeoutSeconds: 600
      }
    },
    {
      url: "https://facilitator.stableyard.fi"
    }
  )
);

app.get("/api/premium-content", (_req, res) => {
  res.redirect("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`x402 server running at http://localhost:${PORT}`);
  console.log(`Pay-to address: ${process.env.MOVEMENT_PAY_TO}`);
});

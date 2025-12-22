// server/src/middleware/x402-compute.middleware.ts
/**
 * x402 Compute Middleware
 * 
 * Dynamic x402 payment calculation for compute resources.
 * This enables per-provider pricing via x402 payment rails.
 */

import { Request, Response, NextFunction } from "express";
import { ProviderService } from "../services/provider.service.js";
import { BlockchainService } from "../services/blockchain.service.js";

const blockchainService = new BlockchainService();
const providerService = new ProviderService(blockchainService);

/**
 * Middleware to calculate dynamic x402 payment amount based on provider
 * This is used before x402 paywall middleware to set correct payment amounts
 */
export async function calculateComputePayment(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Only apply to compute access endpoints
    if (req.path.includes("/api/v1/compute/access/")) {
      const providerAddress = req.params.providerAddress;
      const duration = parseInt(req.query.duration as string) || 60;

      if (providerAddress) {
        try {
          const provider = await providerService.getProvider(providerAddress);
          const totalPrice = provider.pricePerSecond * duration;

          // Attach pricing info to request for x402 middleware
          (req as any).x402ComputePrice = totalPrice;
          (req as any).x402ComputeDuration = duration;
          (req as any).x402ProviderInfo = provider;
        } catch (error) {
          // Provider not found, will be handled by route
        }
      }
    }

    next();
  } catch (error) {
    next();
  }
}


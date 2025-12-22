
import { Account } from "@aptos-labs/ts-sdk";
import { BlockchainService } from "./blockchain.service.js";

export interface ProviderInfo {
  gpuType: string;
  vramGB: number;
  pricePerSecond: number;
  isActive: boolean;
  reputationScore: number;
}

export interface RegisterProviderParams {
  gpuType: string;
  vramGB: number;
  pricePerSecond: number;
  stakeAmount: number;
}

export class ProviderService {
  private readonly MODULE_NAME = "provider_registry";
  private readonly MIN_STAKE_AMOUNT = 100000000; // 0.1 MOVE in Octas

  constructor(private blockchain: BlockchainService) {}

  /**
   * Register a new provider or update existing provider
   * @param account - The provider's account
   * @param params - Provider registration parameters
   * @returns Transaction hash
   */
  async registerProvider(
    account: Account,
    params: RegisterProviderParams
  ): Promise<string> {
    // Validate minimum stake
    if (params.stakeAmount < this.MIN_STAKE_AMOUNT) {
      throw new Error(
        `Stake amount must be at least ${this.MIN_STAKE_AMOUNT} Octas (0.1 MOVE)`
      );
    }

    // Validate other parameters
    if (!params.gpuType || params.gpuType.trim() === "") {
      throw new Error("GPU type is required");
    }
    if (params.vramGB <= 0) {
      throw new Error("VRAM must be greater than 0");
    }
    if (params.pricePerSecond <= 0) {
      throw new Error("Price per second must be greater than 0");
    }

    // Build transaction arguments
    const args = [
      params.gpuType,
      params.vramGB.toString(),
      params.pricePerSecond.toString(),
      params.stakeAmount.toString(),
    ];

    // Execute transaction
    const result = await this.blockchain.executeTransaction(
      account,
      this.MODULE_NAME,
      "register_provider",
      args,
      true // Wait for confirmation
    );

    return result.hash;
  }

  /**
   * Update provider availability status
   * @param account - The provider's account
   * @param isActive - Whether the provider is active
   * @returns Transaction hash
   */
  async updateAvailability(
    account: Account,
    isActive: boolean
  ): Promise<string> {
    const args = [isActive];

    const result = await this.blockchain.executeTransaction(
      account,
      this.MODULE_NAME,
      "update_availability",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Update provider pricing
   * @param account - The provider's account
   * @param newPricePerSecond - New price per second in Octas
   * @returns Transaction hash
   */
  async updatePricing(
    account: Account,
    newPricePerSecond: number
  ): Promise<string> {
    if (newPricePerSecond <= 0) {
      throw new Error("Price per second must be greater than 0");
    }

    const args = [newPricePerSecond.toString()];

    const result = await this.blockchain.executeTransaction(
      account,
      this.MODULE_NAME,
      "update_pricing",
      args,
      true
    );

    return result.hash;
  }

  /**
   * Get provider information
   * @param providerAddress - The provider's wallet address
   * @returns Provider information
   */
  async getProvider(providerAddress: string): Promise<ProviderInfo> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "get_provider",
        [providerAddress]
      );

      // Result format: [gpu_type, vram_gb, price_per_second, is_active, reputation_score]
      return {
        gpuType: result[0] as string,
        vramGB: Number(result[1]),
        pricePerSecond: Number(result[2]),
        isActive: result[3] as boolean,
        reputationScore: Number(result[4]),
      };
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(`Provider not found at address: ${providerAddress}`);
      }
      throw error;
    }
  }

  /**
   * Check if a provider is active
   * @param providerAddress - The provider's wallet address
   * @returns True if provider exists and is active
   */
  async isProviderActive(providerAddress: string): Promise<boolean> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "is_provider_active",
        [providerAddress]
      );
      return result as boolean;
    } catch (error: any) {
      // If provider doesn't exist, return false
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get provider's price per second
   * @param providerAddress - The provider's wallet address
   * @returns Price per second in Octas
   */
  async getProviderPrice(providerAddress: string): Promise<number> {
    try {
      const result = await this.blockchain.callViewFunction(
        this.MODULE_NAME,
        "get_provider_price",
        [providerAddress]
      );
      return Number(result);
    } catch (error: any) {
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        throw new Error(`Provider not found at address: ${providerAddress}`);
      }
      throw error;
    }
  }

  /**
   * Get minimum stake amount required for registration
   * @returns Minimum stake in Octas
   */
  getMinStakeAmount(): number {
    return this.MIN_STAKE_AMOUNT;
  }
}


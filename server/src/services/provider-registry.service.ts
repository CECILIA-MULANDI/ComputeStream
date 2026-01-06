/**
 * @deprecated This in-memory registry is no longer used.
 * Use providerRepository from database/repositories/provider.repository.ts instead.
 * 
 * All provider data is now stored in PostgreSQL and synced via the blockchain indexer.
 */

export interface RegisteredProvider {
  address: string;
  gpuType: string;
  vramGB: number;
  pricePerSecond: number;
  isActive: boolean;
  reputationScore: number;
  registeredAt: number; // Unix timestamp
}

export class ProviderRegistryService {
  private providers: Map<string, RegisteredProvider> = new Map();

  /**
   * Register a provider (called when provider registers on-chain)
   */
  registerProvider(provider: Omit<RegisteredProvider, 'registeredAt'>): void {
    this.providers.set(provider.address, {
      ...provider,
      registeredAt: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * Update provider information
   */
  updateProvider(address: string, updates: Partial<RegisteredProvider>): void {
    const existing = this.providers.get(address);
    if (existing) {
      this.providers.set(address, {
        ...existing,
        ...updates,
      });
    }
  }

  /**
   * Get all providers (optionally filtered by active status)
   */
  getAllProviders(activeOnly: boolean = false): RegisteredProvider[] {
    const allProviders = Array.from(this.providers.values());
    
    if (activeOnly) {
      return allProviders.filter(p => p.isActive);
    }
    
    return allProviders;
  }

  /**
   * Get active providers only
   */
  getActiveProviders(): RegisteredProvider[] {
    return this.getAllProviders(true);
  }

  /**
   * Get provider count
   */
  getProviderCount(activeOnly: boolean = false): number {
    if (activeOnly) {
      return this.getActiveProviders().length;
    }
    return this.providers.size;
  }

  /**
   * Check if provider is registered
   */
  isRegistered(address: string): boolean {
    return this.providers.has(address);
  }

  /**
   * Remove provider (if they deregister)
   */
  removeProvider(address: string): void {
    this.providers.delete(address);
  }

  /**
   * Get provider by address
   */
  getProvider(address: string): RegisteredProvider | undefined {
    return this.providers.get(address);
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistryService();


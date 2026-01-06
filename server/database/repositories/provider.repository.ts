import { pool } from '../connection.js';

export interface Provider {
  id?: string;
  address: string;
  gpu_type: string;
  vram_gb: number;
  price_per_second: bigint;
  stake_amount: bigint;
  reputation_score: number;
  is_active: boolean;
  total_jobs_completed: number;
  total_earnings: bigint;
  created_at?: Date;
  updated_at?: Date;
  last_seen_at?: Date;
}

export class ProviderRepository {
  // Create or update provider
  async upsert(provider: Provider): Promise<Provider> {
    const query = `
      INSERT INTO providers (
        address, gpu_type, vram_gb, price_per_second, stake_amount,
        reputation_score, is_active, total_jobs_completed, total_earnings
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (address) 
      DO UPDATE SET
        gpu_type = EXCLUDED.gpu_type,
        vram_gb = EXCLUDED.vram_gb,
        price_per_second = EXCLUDED.price_per_second,
        stake_amount = EXCLUDED.stake_amount,
        reputation_score = EXCLUDED.reputation_score,
        is_active = EXCLUDED.is_active,
        updated_at = NOW(),
        last_seen_at = NOW()
      RETURNING *;
    `;
    
    const values = [
      provider.address,
      provider.gpu_type,
      provider.vram_gb,
      provider.price_per_second,
      provider.stake_amount,
      provider.reputation_score || 100,
      provider.is_active !== undefined ? provider.is_active : true,
      provider.total_jobs_completed || 0,
      provider.total_earnings || 0n
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get provider by address
  async findByAddress(address: string): Promise<Provider | null> {
    const query = 'SELECT * FROM providers WHERE address = $1';
    const result = await pool.query(query, [address]);
    return result.rows[0] || null;
  }

  // Get all providers
  async findAll(activeOnly: boolean = false): Promise<Provider[]> {
    const query = activeOnly
      ? 'SELECT * FROM providers WHERE is_active = true ORDER BY created_at DESC'
      : 'SELECT * FROM providers ORDER BY created_at DESC';
    
    const result = await pool.query(query);
    return result.rows;
  }

  // Update provider availability
  async updateAvailability(address: string, isActive: boolean): Promise<Provider> {
    const query = `
      UPDATE providers 
      SET is_active = $1, updated_at = NOW(), last_seen_at = NOW()
      WHERE address = $2
      RETURNING *;
    `;
    
    const result = await pool.query(query, [isActive, address]);
    return result.rows[0];
  }

  // Update provider pricing
  async updatePricing(address: string, pricePerSecond: bigint): Promise<Provider> {
    const query = `
      UPDATE providers 
      SET price_per_second = $1, updated_at = NOW()
      WHERE address = $2
      RETURNING *;
    `;
    
    const result = await pool.query(query, [pricePerSecond, address]);
    return result.rows[0];
  }

  // Increment completed jobs
  async incrementJobsCompleted(address: string): Promise<void> {
    const query = `
      UPDATE providers 
      SET total_jobs_completed = total_jobs_completed + 1,
          updated_at = NOW()
      WHERE address = $1;
    `;
    
    await pool.query(query, [address]);
  }

  // Add earnings
  async addEarnings(address: string, amount: bigint): Promise<void> {
    const query = `
      UPDATE providers 
      SET total_earnings = total_earnings + $1,
          updated_at = NOW()
      WHERE address = $2;
    `;
    
    await pool.query(query, [amount, address]);
  }

  // Get provider stats
  async getStats(address: string): Promise<any> {
    const query = 'SELECT * FROM provider_stats WHERE address = $1';
    const result = await pool.query(query, [address]);
    return result.rows[0] || null;
  }

  // Search providers by GPU type
  async searchByGpuType(gpuType: string): Promise<Provider[]> {
    const query = `
      SELECT * FROM providers 
      WHERE gpu_type ILIKE $1 AND is_active = true
      ORDER BY reputation_score DESC, price_per_second ASC;
    `;
    
    const result = await pool.query(query, [`%${gpuType}%`]);
    return result.rows;
  }
}

export const providerRepository = new ProviderRepository();


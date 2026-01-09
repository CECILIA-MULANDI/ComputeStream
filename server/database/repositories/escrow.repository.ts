import { pool } from '../connection.js';

export interface Escrow {
  id?: string;
  job_id: number;
  buyer_address: string;
  provider_address: string;
  total_amount: bigint;
  released_amount: bigint;
  remaining_amount: bigint;
  is_active: boolean;
  transaction_hash?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class EscrowRepository {
  // Create or update escrow
  async upsert(escrow: Escrow): Promise<Escrow> {
    const query = `
      INSERT INTO escrow (
        job_id, buyer_address, provider_address, total_amount,
        released_amount, remaining_amount, is_active, transaction_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (job_id) 
      DO UPDATE SET
        released_amount = EXCLUDED.released_amount,
        remaining_amount = EXCLUDED.remaining_amount,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING *;
    `;
    
    const remainingAmount = escrow.remaining_amount ?? 
      (escrow.total_amount - (escrow.released_amount || 0n));
    
    const values = [
      escrow.job_id,
      escrow.buyer_address,
      escrow.provider_address,
      escrow.total_amount,
      escrow.released_amount || 0n,
      remainingAmount,
      escrow.is_active !== undefined ? escrow.is_active : true,
      escrow.transaction_hash || null
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get escrow by job_id
  async findByJobId(jobId: number): Promise<Escrow | null> {
    const query = 'SELECT * FROM escrow WHERE job_id = $1';
    const result = await pool.query(query, [jobId]);
    return result.rows[0] || null;
  }

  // Get all escrows for a buyer
  async findByBuyer(buyerAddress: string): Promise<Escrow[]> {
    const query = 'SELECT * FROM escrow WHERE buyer_address = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [buyerAddress]);
    return result.rows;
  }

  // Get all escrows for a provider
  async findByProvider(providerAddress: string): Promise<Escrow[]> {
    const query = 'SELECT * FROM escrow WHERE provider_address = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [providerAddress]);
    return result.rows;
  }

  // Get active escrows
  async findActive(): Promise<Escrow[]> {
    const query = 'SELECT * FROM escrow WHERE is_active = true ORDER BY created_at DESC';
    const result = await pool.query(query);
    return result.rows;
  }

  // Release payment from escrow
  async releasePayment(jobId: number, amount: bigint): Promise<Escrow | null> {
    const query = `
      UPDATE escrow 
      SET released_amount = released_amount + $1,
          remaining_amount = remaining_amount - $1,
          updated_at = NOW()
      WHERE job_id = $2 AND remaining_amount >= $1
      RETURNING *;
    `;
    const result = await pool.query(query, [amount, jobId]);
    return result.rows[0] || null;
  }

  // Close escrow (mark as inactive)
  async closeEscrow(jobId: number): Promise<Escrow | null> {
    const query = `
      UPDATE escrow 
      SET is_active = false, updated_at = NOW()
      WHERE job_id = $1
      RETURNING *;
    `;
    const result = await pool.query(query, [jobId]);
    return result.rows[0] || null;
  }

  // Refund escrow (release remaining to buyer, close escrow)
  async refundEscrow(jobId: number): Promise<Escrow | null> {
    const query = `
      UPDATE escrow 
      SET is_active = false, 
          remaining_amount = 0,
          updated_at = NOW()
      WHERE job_id = $1
      RETURNING *;
    `;
    const result = await pool.query(query, [jobId]);
    return result.rows[0] || null;
  }

  // Get total escrowed amount for a buyer
  async getTotalEscrowedByBuyer(buyerAddress: string): Promise<bigint> {
    const query = `
      SELECT COALESCE(SUM(remaining_amount), 0) as total 
      FROM escrow 
      WHERE buyer_address = $1 AND is_active = true
    `;
    const result = await pool.query(query, [buyerAddress]);
    return BigInt(result.rows[0].total);
  }

  // Get total released to a provider
  async getTotalReleasedToProvider(providerAddress: string): Promise<bigint> {
    const query = `
      SELECT COALESCE(SUM(released_amount), 0) as total 
      FROM escrow 
      WHERE provider_address = $1
    `;
    const result = await pool.query(query, [providerAddress]);
    return BigInt(result.rows[0].total);
  }
}

export const escrowRepository = new EscrowRepository();


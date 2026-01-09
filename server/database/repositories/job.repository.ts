import { pool } from '../connection.js';

export interface Job {
  id?: string;
  job_id: number;
  buyer_address: string;
  provider_address: string;
  docker_image: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  escrow_amount: bigint;
  max_duration: number;
  start_time?: number;
  end_time?: number;
  output_url?: string;
  transaction_hash?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class JobRepository {
  // Create or update job
  async upsert(job: Job): Promise<Job> {
    const query = `
      INSERT INTO jobs (
        job_id, buyer_address, provider_address, docker_image, status,
        escrow_amount, max_duration, start_time, end_time, output_url, transaction_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (job_id) 
      DO UPDATE SET
        status = EXCLUDED.status,
        start_time = COALESCE(EXCLUDED.start_time, jobs.start_time),
        end_time = COALESCE(EXCLUDED.end_time, jobs.end_time),
        output_url = COALESCE(EXCLUDED.output_url, jobs.output_url),
        updated_at = NOW()
      RETURNING *;
    `;
    
    const values = [
      job.job_id,
      job.buyer_address,
      job.provider_address,
      job.docker_image,
      job.status || 'pending',
      job.escrow_amount,
      job.max_duration,
      job.start_time || null,
      job.end_time || null,
      job.output_url || null,
      job.transaction_hash || null
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get job by job_id
  async findByJobId(jobId: number): Promise<Job | null> {
    const query = 'SELECT * FROM jobs WHERE job_id = $1';
    const result = await pool.query(query, [jobId]);
    return result.rows[0] || null;
  }

  // Get job by buyer address and job_id
  async findByBuyerAndJobId(buyerAddress: string, jobId: number): Promise<Job | null> {
    const query = 'SELECT * FROM jobs WHERE buyer_address = $1 AND job_id = $2';
    const result = await pool.query(query, [buyerAddress, jobId]);
    return result.rows[0] || null;
  }

  // Get all jobs for a buyer
  // Use case-insensitive matching since wallet addresses might be stored in different cases
  async findByBuyer(buyerAddress: string): Promise<Job[]> {
    const query = 'SELECT * FROM jobs WHERE LOWER(buyer_address) = LOWER($1) ORDER BY created_at DESC';
    const result = await pool.query(query, [buyerAddress]);
    return result.rows;
  }

  // Get all jobs for a provider
  async findByProvider(providerAddress: string): Promise<Job[]> {
    const query = 'SELECT * FROM jobs WHERE provider_address = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [providerAddress]);
    return result.rows;
  }

  // Get jobs by status
  async findByStatus(status: string): Promise<Job[]> {
    const query = 'SELECT * FROM jobs WHERE status = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [status]);
    return result.rows;
  }

  // Get active jobs (pending or running)
  async findActive(): Promise<Job[]> {
    const query = `
      SELECT * FROM jobs 
      WHERE status IN ('pending', 'running') 
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  // Update job status
  async updateStatus(jobId: number, status: string): Promise<Job | null> {
    const query = `
      UPDATE jobs 
      SET status = $1, updated_at = NOW()
      WHERE job_id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [status, jobId]);
    return result.rows[0] || null;
  }

  // Start job (update status and start_time)
  async startJob(jobId: number, startTime: number): Promise<Job | null> {
    const query = `
      UPDATE jobs 
      SET status = 'running', start_time = $1, updated_at = NOW()
      WHERE job_id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [startTime, jobId]);
    return result.rows[0] || null;
  }

  // Complete job (update status, end_time, and output_url)
  async completeJob(jobId: number, endTime: number, outputUrl?: string): Promise<Job | null> {
    const query = `
      UPDATE jobs 
      SET status = 'completed', end_time = $1, output_url = $2, updated_at = NOW()
      WHERE job_id = $3
      RETURNING *;
    `;
    const result = await pool.query(query, [endTime, outputUrl || null, jobId]);
    return result.rows[0] || null;
  }

  // Fail job
  async failJob(jobId: number, endTime: number): Promise<Job | null> {
    const query = `
      UPDATE jobs 
      SET status = 'failed', end_time = $1, updated_at = NOW()
      WHERE job_id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [endTime, jobId]);
    return result.rows[0] || null;
  }

  // Cancel job
  async cancelJob(jobId: number): Promise<Job | null> {
    const query = `
      UPDATE jobs 
      SET status = 'cancelled', updated_at = NOW()
      WHERE job_id = $1 AND status = 'pending'
      RETURNING *;
    `;
    const result = await pool.query(query, [jobId]);
    return result.rows[0] || null;
  }

  // Get active jobs with provider info (uses the view)
  async findActiveWithProviders(): Promise<any[]> {
    const query = 'SELECT * FROM active_jobs_with_providers';
    const result = await pool.query(query);
    return result.rows;
  }

  // Count jobs by status
  async countByStatus(): Promise<Record<string, number>> {
    const query = `
      SELECT status, COUNT(*) as count 
      FROM jobs 
      GROUP BY status
    `;
    const result = await pool.query(query);
    return result.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);
  }
}

export const jobRepository = new JobRepository();


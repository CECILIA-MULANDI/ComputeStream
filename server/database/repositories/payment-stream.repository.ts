import { pool } from '../connection.js';

export interface PaymentStream {
  id?: string;
  job_id: number;
  payer_address: string;
  payee_address: string;
  rate_per_second: bigint;
  start_time: number;
  end_time?: number;
  total_streamed: bigint;
  is_active: boolean;
  transaction_hash?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface PaymentEvent {
  id?: string;
  job_id: number;
  stream_id: string;
  amount: bigint;
  timestamp: Date;
  transaction_hash?: string;
  block_number?: number;
}

export class PaymentStreamRepository {
  // Create or update payment stream
  async upsert(stream: PaymentStream): Promise<PaymentStream> {
    const query = `
      INSERT INTO payment_streams (
        job_id, payer_address, payee_address, rate_per_second,
        start_time, end_time, total_streamed, is_active, transaction_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (job_id) 
      DO UPDATE SET
        total_streamed = EXCLUDED.total_streamed,
        end_time = EXCLUDED.end_time,
        is_active = EXCLUDED.is_active,
        updated_at = NOW()
      RETURNING *;
    `;
    
    const values = [
      stream.job_id,
      stream.payer_address,
      stream.payee_address,
      stream.rate_per_second,
      stream.start_time,
      stream.end_time || null,
      stream.total_streamed || 0n,
      stream.is_active !== undefined ? stream.is_active : true,
      stream.transaction_hash || null
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get stream by job_id
  async findByJobId(jobId: number): Promise<PaymentStream | null> {
    const query = 'SELECT * FROM payment_streams WHERE job_id = $1';
    const result = await pool.query(query, [jobId]);
    return result.rows[0] || null;
  }

  // Get stream by payer and job_id
  async findByPayerAndJobId(payerAddress: string, jobId: number): Promise<PaymentStream | null> {
    const query = 'SELECT * FROM payment_streams WHERE payer_address = $1 AND job_id = $2';
    const result = await pool.query(query, [payerAddress, jobId]);
    return result.rows[0] || null;
  }

  // Get all streams for a payer
  async findByPayer(payerAddress: string): Promise<PaymentStream[]> {
    const query = 'SELECT * FROM payment_streams WHERE payer_address = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [payerAddress]);
    return result.rows;
  }

  // Get all streams for a payee (provider)
  async findByPayee(payeeAddress: string): Promise<PaymentStream[]> {
    const query = 'SELECT * FROM payment_streams WHERE payee_address = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [payeeAddress]);
    return result.rows;
  }

  // Get active streams
  async findActive(): Promise<PaymentStream[]> {
    const query = 'SELECT * FROM payment_streams WHERE is_active = true ORDER BY created_at DESC';
    const result = await pool.query(query);
    return result.rows;
  }

  // Update streamed amount
  async updateStreamedAmount(jobId: number, amount: bigint): Promise<PaymentStream | null> {
    const query = `
      UPDATE payment_streams 
      SET total_streamed = total_streamed + $1, updated_at = NOW()
      WHERE job_id = $2 AND is_active = true
      RETURNING *;
    `;
    const result = await pool.query(query, [amount, jobId]);
    return result.rows[0] || null;
  }

  // Close stream
  async closeStream(jobId: number, endTime: number): Promise<PaymentStream | null> {
    const query = `
      UPDATE payment_streams 
      SET is_active = false, end_time = $1, updated_at = NOW()
      WHERE job_id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [endTime, jobId]);
    return result.rows[0] || null;
  }

  // Pause stream (set inactive but don't set end_time)
  async pauseStream(jobId: number): Promise<PaymentStream | null> {
    const query = `
      UPDATE payment_streams 
      SET is_active = false, updated_at = NOW()
      WHERE job_id = $1
      RETURNING *;
    `;
    const result = await pool.query(query, [jobId]);
    return result.rows[0] || null;
  }

  // Resume stream
  async resumeStream(jobId: number): Promise<PaymentStream | null> {
    const query = `
      UPDATE payment_streams 
      SET is_active = true, updated_at = NOW()
      WHERE job_id = $1
      RETURNING *;
    `;
    const result = await pool.query(query, [jobId]);
    return result.rows[0] || null;
  }

  // ============================================================================
  // Payment Events (time-series data)
  // ============================================================================

  // Record a payment event
  async recordPaymentEvent(event: PaymentEvent): Promise<PaymentEvent> {
    const query = `
      INSERT INTO payment_events (
        job_id, stream_id, amount, timestamp, transaction_hash, block_number
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    
    const values = [
      event.job_id,
      event.stream_id,
      event.amount,
      event.timestamp || new Date(),
      event.transaction_hash || null,
      event.block_number || null
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Get payment events for a job
  async getPaymentEvents(jobId: number, limit: number = 100): Promise<PaymentEvent[]> {
    const query = `
      SELECT * FROM payment_events 
      WHERE job_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2
    `;
    const result = await pool.query(query, [jobId, limit]);
    return result.rows;
  }

  // Get payment events for a stream
  async getPaymentEventsByStream(streamId: string, limit: number = 100): Promise<PaymentEvent[]> {
    const query = `
      SELECT * FROM payment_events 
      WHERE stream_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2
    `;
    const result = await pool.query(query, [streamId, limit]);
    return result.rows;
  }

  // Get total streamed for a job from events
  async getTotalStreamedFromEvents(jobId: number): Promise<bigint> {
    const query = `
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM payment_events 
      WHERE job_id = $1
    `;
    const result = await pool.query(query, [jobId]);
    return BigInt(result.rows[0].total);
  }

  // Get payment events in time range
  async getPaymentEventsInRange(
    jobId: number, 
    startTime: Date, 
    endTime: Date
  ): Promise<PaymentEvent[]> {
    const query = `
      SELECT * FROM payment_events 
      WHERE job_id = $1 AND timestamp >= $2 AND timestamp <= $3
      ORDER BY timestamp ASC
    `;
    const result = await pool.query(query, [jobId, startTime, endTime]);
    return result.rows;
  }

  // Get streaming statistics
  async getStreamingStats(): Promise<{
    activeStreams: number;
    totalStreamed: bigint;
    totalPaymentEvents: number;
  }> {
    const activeQuery = 'SELECT COUNT(*) as count FROM payment_streams WHERE is_active = true';
    const totalQuery = 'SELECT COALESCE(SUM(total_streamed), 0) as total FROM payment_streams';
    const eventsQuery = 'SELECT COUNT(*) as count FROM payment_events';
    
    const [activeResult, totalResult, eventsResult] = await Promise.all([
      pool.query(activeQuery),
      pool.query(totalQuery),
      pool.query(eventsQuery)
    ]);
    
    return {
      activeStreams: parseInt(activeResult.rows[0].count),
      totalStreamed: BigInt(totalResult.rows[0].total),
      totalPaymentEvents: parseInt(eventsResult.rows[0].count)
    };
  }
}

export const paymentStreamRepository = new PaymentStreamRepository();


-- ComputeStream Database Schema
-- PostgreSQL + TimescaleDB

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PROVIDERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address VARCHAR(66) UNIQUE NOT NULL,
    gpu_type VARCHAR(255) NOT NULL,
    vram_gb INTEGER NOT NULL,
    price_per_second BIGINT NOT NULL,
    stake_amount BIGINT NOT NULL,
    reputation_score INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    total_jobs_completed INTEGER DEFAULT 0,
    total_earnings BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_providers_address ON providers(address);
CREATE INDEX IF NOT EXISTS idx_providers_active ON providers(is_active);
CREATE INDEX IF NOT EXISTS idx_providers_gpu_type ON providers(gpu_type);

-- ============================================================================
-- JOBS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id BIGINT UNIQUE NOT NULL,
    buyer_address VARCHAR(66) NOT NULL,
    provider_address VARCHAR(66) NOT NULL,
    docker_image VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    escrow_amount BIGINT NOT NULL,
    max_duration INTEGER NOT NULL,
    start_time BIGINT,
    end_time BIGINT,
    output_url TEXT,
    transaction_hash VARCHAR(66),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (provider_address) REFERENCES providers(address) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_job_id ON jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_buyer ON jobs(buyer_address);
CREATE INDEX IF NOT EXISTS idx_jobs_provider ON jobs(provider_address);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

-- ============================================================================
-- PAYMENT STREAMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_streams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id BIGINT NOT NULL,
    payer_address VARCHAR(66) NOT NULL,
    payee_address VARCHAR(66) NOT NULL,
    rate_per_second BIGINT NOT NULL,
    start_time BIGINT NOT NULL,
    end_time BIGINT,
    total_streamed BIGINT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    transaction_hash VARCHAR(66),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_streams_job_id ON payment_streams(job_id);
CREATE INDEX IF NOT EXISTS idx_streams_payer ON payment_streams(payer_address);
CREATE INDEX IF NOT EXISTS idx_streams_payee ON payment_streams(payee_address);
CREATE INDEX IF NOT EXISTS idx_streams_active ON payment_streams(is_active);

-- ============================================================================
-- PAYMENT EVENTS TABLE (TimescaleDB hypertable for time-series data)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_events (
    id UUID DEFAULT uuid_generate_v4(),
    job_id BIGINT NOT NULL,
    stream_id UUID NOT NULL,
    amount BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transaction_hash VARCHAR(66),
    block_number BIGINT,
    PRIMARY KEY (id, timestamp),
    FOREIGN KEY (stream_id) REFERENCES payment_streams(id) ON DELETE CASCADE
);

-- Convert to TimescaleDB hypertable (for efficient time-series queries)
-- Only run if TimescaleDB extension is available
-- SELECT create_hypertable('payment_events', 'timestamp', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_payment_events_job_id ON payment_events(job_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_payment_events_stream_id ON payment_events(stream_id, timestamp DESC);

-- ============================================================================
-- TRANSACTIONS TABLE (All blockchain transactions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_hash VARCHAR(66) UNIQUE NOT NULL,
    from_address VARCHAR(66) NOT NULL,
    to_address VARCHAR(66),
    transaction_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    gas_used BIGINT,
    block_number BIGINT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);

-- ============================================================================
-- ESCROW TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS escrow (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id BIGINT UNIQUE NOT NULL,
    buyer_address VARCHAR(66) NOT NULL,
    provider_address VARCHAR(66) NOT NULL,
    total_amount BIGINT NOT NULL,
    released_amount BIGINT DEFAULT 0,
    remaining_amount BIGINT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    transaction_hash VARCHAR(66),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_escrow_job_id ON escrow(job_id);
CREATE INDEX IF NOT EXISTS idx_escrow_buyer ON escrow(buyer_address);
CREATE INDEX IF NOT EXISTS idx_escrow_provider ON escrow(provider_address);
CREATE INDEX IF NOT EXISTS idx_escrow_active ON escrow(is_active);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_providers_updated_at BEFORE UPDATE ON providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_streams_updated_at BEFORE UPDATE ON payment_streams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_escrow_updated_at BEFORE UPDATE ON escrow
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update escrow remaining amount
CREATE OR REPLACE FUNCTION update_escrow_remaining()
RETURNS TRIGGER AS $$
BEGIN
    NEW.remaining_amount = NEW.total_amount - NEW.released_amount;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_escrow_remaining_trigger BEFORE UPDATE ON escrow
    FOR EACH ROW EXECUTE FUNCTION update_escrow_remaining();

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Active jobs with provider info
CREATE OR REPLACE VIEW active_jobs_with_providers AS
SELECT 
    j.job_id,
    j.buyer_address,
    j.provider_address,
    j.docker_image,
    j.status,
    j.escrow_amount,
    j.created_at,
    p.gpu_type,
    p.vram_gb,
    p.price_per_second,
    ps.total_streamed,
    ps.is_active as stream_active
FROM jobs j
JOIN providers p ON j.provider_address = p.address
LEFT JOIN payment_streams ps ON j.job_id = ps.job_id
WHERE j.status IN ('pending', 'running');

-- Provider statistics
CREATE OR REPLACE VIEW provider_stats AS
SELECT 
    p.address,
    p.gpu_type,
    p.is_active,
    p.total_jobs_completed,
    p.total_earnings,
    COUNT(j.id) as active_jobs,
    COALESCE(SUM(ps.total_streamed), 0) as current_streaming_earnings
FROM providers p
LEFT JOIN jobs j ON p.address = j.provider_address AND j.status = 'running'
LEFT JOIN payment_streams ps ON j.job_id = ps.job_id AND ps.is_active = true
GROUP BY p.address, p.gpu_type, p.is_active, p.total_jobs_completed, p.total_earnings;

-- ============================================================================
-- INITIAL DATA / SEED (Optional)
-- ============================================================================

-- You can add seed data here if needed


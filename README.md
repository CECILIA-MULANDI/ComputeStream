# ComputeStream
![ComputeStream logo](./CS1.png)


**Decentralized GPU Marketplace with x402 Micropayment Streaming on Movement Network**

A peer-to-peer compute marketplace enabling sub-cent, per-second GPU rental through x402 payment streaming.

![ComputeStream Architecture](./computeStream.png)

---

## What is ComputeStream?

ComputeStream lets anyone rent GPU compute by the **second** and pay only for what they use. We combine two payment systems:

1. **x402 Protocol** — HTTP-native payments for AI agents to autonomously access compute
2. **Move Smart Contracts** — On-chain per-second micropayment streaming from escrow to providers

This creates the first truly utility-style GPU marketplace: spin up compute, pay by the second, stop when you're done.

---

## Why It Matters

| Problem | ComputeStream Solution |
|---------|----------------------|
| Cloud instances charge for idle time | Pay-per-second billing |
| AI agents can't autonomously purchase compute | x402 enables HTTP-based machine payments |
| Complex API keys and account setup | Just crypto + HTTP requests |
| Provider payment delays | Real-time streaming payments every second |

---

## Architecture

### Smart Contracts (Move on Movement)

```
compute-stream/move/sources/
├── provider_registry.move   # GPU registration, pricing, availability
├── job_registry.move        # Job lifecycle and status tracking
├── escrow.move              # Lock funds, release payments, handle refunds
└── payment_stream.move      # Per-second micropayment streaming
```

### Backend (Node.js/Express)

- **x402 Middleware** — Returns HTTP 402 for compute endpoints, validates payments
- **Payment Orchestrator** — Triggers `process_payment()` every second during active jobs
- **Provider/Job Services** — CRUD operations synced with on-chain state

### Frontend (React/Vite)

- Provider registration and management
- Job creation and monitoring
- Real-time payment stream visualization
- Movement wallet integration

---

## Payment Flow

```
1. Agent requests compute
        ↓
2. Server returns HTTP 402 Payment Required
        ↓
3. Agent pays via x402 headers → Access granted
        ↓
4. Escrow deposited to Move contract
        ↓
5. Job executes, payment streams every second:
   └─ process_payment() releases funds from escrow → provider
        ↓
6. Job completes → Stream closes → Unused escrow refunded
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Blockchain | Movement Network |
| Smart Contracts | Move |
| Payment Protocol | x402 |
| Backend | Node.js, Express, TypeScript |
| Frontend | React 18, Vite, TailwindCSS |
| Wallet | Aptos Wallet Adapter |

---

## Quick Start

```bash
# Clone
git clone https://github.com/CECILIA-MULANDI/ComputeStream
cd computestream

# Server
cd server
npm install
npm run dev  # Runs on port 4402

# Frontend (new terminal)
cd frontend
npm install
npm run dev  # Runs on port 5173
```

### Environment Variables

```bash
# server/.env
MOVEMENT_RPC_URL=https://devnet.m1.movementlabs.xyz
MOVEMENT_PAY_TO=<your_wallet_address>
PORT=4402
```

---

## API Endpoints

**Providers**
- `POST /api/v1/providers/register` — Register as compute provider
- `GET /api/v1/providers/available` — List available providers

**Jobs**
- `POST /api/v1/jobs/create` — Create compute job
- `GET /api/v1/jobs/:id/status` — Get job status

**x402 Protected (requires payment)**
- `GET /api/v1/compute/access/:providerAddress` — Access compute resource
- `POST /api/v1/compute/execute` — Execute compute job

---

## Smart Contract Interface

```move
// Open payment stream when job starts
public entry fun open_stream(
    payer: &signer,
    job_id: u64,
    payee_address: address,
    rate_per_second: u64,
    start_time: u64
)

// Called every second during job execution
public entry fun process_payment(
    payer: &signer,
    job_id: u64,
    current_time: u64
)

// Close stream when job completes
public entry fun close_stream(
    payer: &signer,
    job_id: u64,
    final_time: u64
)
```

---

## Project Structure

```
ComputeStream/
├── compute-stream/move/     # Move smart contracts
├── server/                  # Node.js backend
│   ├── src/routes/          # API endpoints
│   ├── src/services/        # Business logic
│   └── src/middleware/      # x402 payment gate
├── frontend/                # React frontend
│   ├── src/pages/           # Dashboard, providers, jobs
│   └── src/services/        # Wallet, x402 client
└── README.md
```

---

## Team

**Lynette** — https://github.com/Lynette7 

**Cecilia** — https://github.com/CECILIA-MULANDI

---



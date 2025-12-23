export interface Provider {
  address: string;
  gpuType: string;
  vramGB: number;
  pricePerSecond: number;
  pricePerSecondMOVE?: number;
  isActive: boolean;
  reputationScore: number;
  registeredAt?: number;
}

export interface Job {
  jobId: number;
  buyerAddress: string;
  providerAddress: string;
  dockerImage: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  escrowAmount: number;
  maxDuration: number;
  startTime?: number;
  endTime?: number;
  outputUrl?: string;
}

export interface PaymentStream {
  payerAddress: string;
  jobId: number;
  payeeAddress: string;
  ratePerSecond: number;
  totalStreamed: number;
  startTime: number;
  isActive: boolean;
  isPaused: boolean;
}


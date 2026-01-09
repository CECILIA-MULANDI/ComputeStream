import axios from 'axios';
import type { Provider, Job } from './types';

const API_BASE_URL = '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Providers
export const providerApi = {
  list: async (activeOnly = false): Promise<Provider[]> => {
    const response = await api.get('/providers', {
      params: { activeOnly },
    });
    return response.data.providers || [];
  },

  get: async (address: string): Promise<Provider> => {
    const response = await api.get(`/providers/${address}`);
    return response.data.provider;
  },

  // Note: Provider registration is now done client-side via wallet signing
  // This is kept for backwards compatibility but not used
  register: async (data: {
    gpuType: string;
    vramGB: number;
    pricePerSecond: number;
    stakeAmount: number;
  }) => {
    const response = await api.post('/providers/register', data);
    return response.data;
  },

  // Note: Availability updates now done via wallet
  updateAvailability: async (address: string, data: {
    isActive: boolean;
  }) => {
    const response = await api.patch(`/providers/${address}/availability`, data);
    return response.data;
  },

  getMinStake: async () => {
    const response = await api.get('/providers/min-stake');
    return response.data;
  },
};

// Jobs
export const jobApi = {
  create: async (data: {
    privateKey: string;
    providerAddress: string;
    dockerImage: string;
    escrowAmount: number;
    maxDuration: number;
  }) => {
    const response = await api.post('/jobs/create', data);
    return response.data;
  },

  get: async (buyerAddress: string, jobId: number): Promise<Job> => {
    const response = await api.get(`/jobs/${buyerAddress}/${jobId}`);
    return response.data.job;
  },

  getStatus: async (buyerAddress: string, jobId: number) => {
    const response = await api.get(`/jobs/${buyerAddress}/${jobId}/status`);
    return response.data;
  },
  
  listByBuyer: async (buyerAddress: string): Promise<Job[]> => {
    const response = await api.get(`/jobs/db/buyer/${buyerAddress}`);
    return response.data.jobs || [];
  },
};

// Escrow
export const escrowApi = {
  deposit: async (data: {
    privateKey: string;
    jobId: number;
    providerAddress: string;
    amount: number;
  }) => {
    const response = await api.post('/escrow/deposit', data);
    return response.data;
  },

  getBalance: async (buyerAddress: string, jobId: number) => {
    const response = await api.get(`/escrow/${buyerAddress}/${jobId}/balance`);
    return response.data;
  },
};

// Payment Streams
export const paymentStreamApi = {
  open: async (data: {
    privateKey: string;
    jobId: number;
    payeeAddress: string;
    ratePerSecond: number;
  }) => {
    const response = await api.post('/payments/stream/open', data);
    return response.data;
  },

  get: async (payerAddress: string, jobId: number) => {
    const response = await api.get(`/payments/stream/${payerAddress}/${jobId}`);
    return response.data.stream;
  },
};

// x402 Compute - Uses x402 payment protocol
import { x402ComputeApi } from './services/x402Client';

export const computeApi = {
  listProviders: async () => {
    const response = await api.get('/compute/providers');
    return response.data.providers || [];
  },

  execute: async (data: {
    providerAddress: string;
    dockerImage: string;
    duration: number;
  }) => {
    // Use x402 payment-enabled client (payment via wallet)
    return await x402ComputeApi.execute(data);
  },
};

export default api;


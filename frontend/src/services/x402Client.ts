/**
 * x402 v1 Payment Client for Movement Network
 * Custom implementation that handles x402 v1 protocol (used by x402plus backend)
 */

import axios from 'axios';
import { getWalletState, signX402Payment } from './walletIntegration';

/**
 * Parse x402 v1 payment details from 402 response headers
 */
function parseX402V1PaymentRequest(headers: any): {
  payTo: string;
  network: string;
  maxAmount: string;
  description: string;
} | null {
  // x402 v1 uses X-PAYMENT-* headers
  const paymentRequired = headers['x-payment-required'] || headers['payment-required'];
  
  if (!paymentRequired) {
    // Try to parse from WWW-Authenticate header (x402 v1 style)
    const wwwAuth = headers['www-authenticate'];
    if (wwwAuth && wwwAuth.includes('x402')) {
      // Parse x402 v1 format
      console.log('Parsing x402 v1 from WWW-Authenticate:', wwwAuth);
    }
  }
  
  return {
    payTo: headers['x-payment-address'] || headers['payment-address'] || headers['x-pay-to'] || '',
    network: headers['x-payment-network'] || headers['payment-network'] || 'movement',
    maxAmount: headers['x-payment-amount'] || headers['payment-amount'] || headers['x-max-amount'] || '0',
    description: headers['x-payment-description'] || headers['payment-description'] || 'x402 payment',
  };
}

/**
 * Make an x402 v1 enabled request
 * Handles 402 Payment Required responses by prompting for wallet payment
 */
export async function x402Request(
  url: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<any> {
  const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
  
  try {
    console.log('🚀 Making x402 request to:', fullUrl);
    
    // Make initial request
    const response = await axios({
      url: fullUrl,
      method: options.method || 'GET',
      data: options.body,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      validateStatus: (status) => status < 500, // Don't throw on 402
    });
    
    // Success - no payment needed
    if (response.status === 200 || response.status === 201) {
      console.log('✅ Request successful');
      return response.data;
    }
    
    // Handle 402 Payment Required (x402 v1)
    if (response.status === 402) {
      console.log('💰 x402 Payment Required - processing...');
      console.log('Response headers:', response.headers);
      console.log('Response body:', response.data);
      
      // Parse payment details from headers (cast to any for axios compatibility)
      const paymentInfo = parseX402V1PaymentRequest(response.headers as any);
      console.log('Payment info from headers:', paymentInfo);
      
      // Get amount from response body (x402plus puts it there)
      let amount = '5000000000'; // Default 50 MOVE
      let description = 'Compute job payment';
      let payTo = '0x69fa4604bbf4e835e978b4d7ef1cfe365f589291428a9d6332b6cd9f4e5e8ff1';
      
      // Try to parse from response body (x402plus format)
      if (response.data) {
        // x402plus format
        if (response.data.maxAmountRequired) amount = String(response.data.maxAmountRequired);
        if (response.data.description) description = response.data.description;
        if (response.data.payTo) payTo = response.data.payTo;
        
        // Nested paymentRequirements format
        if (response.data.paymentRequirements) {
          const reqs = response.data.paymentRequirements;
          if (reqs.maxAmountRequired) amount = String(reqs.maxAmountRequired);
          if (reqs.description) description = reqs.description;
          if (reqs.payTo) payTo = reqs.payTo;
        }
        
        // x402 v1 accepts array format
        if (response.data.accepts && Array.isArray(response.data.accepts) && response.data.accepts.length > 0) {
          const accept = response.data.accepts[0];
          if (accept.maxAmountRequired) amount = String(accept.maxAmountRequired);
          if (accept.description) description = accept.description;
          if (accept.payTo) payTo = accept.payTo;
        }
      }
      
      // Override with header values if present
      if (paymentInfo?.maxAmount && paymentInfo.maxAmount !== '0') amount = paymentInfo.maxAmount;
      if (paymentInfo?.payTo) payTo = paymentInfo.payTo;
      if (paymentInfo?.description && paymentInfo.description !== 'x402 payment') description = paymentInfo.description;
      
      console.log('Final payment details:', { amount, description, payTo });
      
      // Check wallet connection
      const walletState = getWalletState();
      if (!walletState.connected) {
        throw new Error('Wallet not connected. Please connect your Movement wallet first.');
      }
      
      // Calculate amount in MOVE for display
      const amountInMove = (parseInt(amount) / 100000000).toFixed(2);
      
      // Confirm payment with user
      const confirmPayment = window.confirm(
        `💰 Payment Required\n\n` +
        `Amount: ${amountInMove} MOVE\n` +
        `Description: ${description}\n` +
        `Recipient: ${payTo.slice(0, 10)}...${payTo.slice(-6)}\n\n` +
        `Proceed with payment?`
      );
      
      if (!confirmPayment) {
        throw new Error('Payment cancelled by user');
      }
      
      // Sign and submit payment
      console.log('🔐 Signing payment transaction...');
      const txHash = await signX402Payment({
        amount,
        recipient: payTo,
        description,
      });
      
      console.log('✅ Payment transaction submitted:', txHash);
      
      // Retry request with payment proof
      console.log('🔄 Retrying request with payment proof...');
      const retryResponse = await axios({
        url: fullUrl,
        method: options.method || 'GET',
        data: options.body,
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Proof': txHash,
          'X-Payment': txHash,
          'Payment': txHash,
          ...options.headers,
        },
      });
      
      console.log('✅ Request successful after payment!');
      return retryResponse.data;
    }
    
    // Other error
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    
  } catch (error: any) {
    console.error('❌ x402 request failed:', error);
    throw error;
  }
}

/**
 * Compute API with x402 v1 payment support
 */
export const x402ComputeApi = {
  /**
   * Execute compute job with automatic x402 payment
   */
  execute: async (data: {
    providerAddress: string;
    dockerImage: string;
    duration: number;
    privateKey?: string;
  }) => {
    return await x402Request('/api/v1/compute/execute', {
      method: 'POST',
      body: data,
    });
  },
  
  /**
   * Access compute provider with x402 payment
   */
  access: async (providerAddress: string) => {
    return await x402Request(`/api/v1/compute/access/${providerAddress}`, {
      method: 'GET',
    });
  }
};

export default x402Request;

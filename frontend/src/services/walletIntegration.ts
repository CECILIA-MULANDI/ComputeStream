/**
 * Movement Wallet Integration
 * Handles wallet connection and payment signing for x402
 * 
 * NOTE: This integration uses Nightly wallet exclusively for Movement Network
 */

import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

// Only Nightly wallet is supported
export type WalletType = 'nightly';

// Initialize Aptos SDK for building transactions
// Movement Network uses Aptos-compatible APIs
const getAptosClient = () => {
  // Use Movement Testnet RPC
  // Remove /v1 suffix if present (SDK adds it automatically)
  const env = (import.meta as any).env || {};
  let rpcUrl = env.VITE_MOVEMENT_RPC_URL || 'https://testnet.movementnetwork.xyz';
  rpcUrl = rpcUrl.replace(/\/v1\/?$/, '');
  
  const config = new AptosConfig({
    network: Network.CUSTOM,
    fullnode: rpcUrl,
  });
  return new Aptos(config);
};

// Wallet state
interface WalletState {
  connected: boolean;
  address: string | null;
  walletType: WalletType | null;
}

const STORAGE_KEY = 'computestream_wallet_state';

// Load wallet state from localStorage
function loadWalletState(): WalletState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Verify wallet is still connected
      if (parsed.connected && parsed.address) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('Failed to load wallet state:', error);
  }
  return {
    connected: false,
    address: null,
    walletType: null,
  };
}

// Save wallet state to localStorage
function saveWalletState(state: WalletState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save wallet state:', error);
  }
}

let walletState: WalletState = loadWalletState();

/**
 * Get Nightly wallet provider
 * Nightly wallet exposes chain-specific APIs under nightly.aptos namespace
 */
function getWalletProvider(_walletType: WalletType = 'nightly'): any {
  const w = window as any;
  
  // Check if Nightly is installed
  if (!w.nightly) {
    console.error('Nightly wallet not found');
    return null;
  }
  
  console.log('Nightly wallet namespaces:', Object.keys(w.nightly));
  
  // Nightly wallet exposes chain-specific APIs
  // For Movement (Move-based), use the aptos namespace
  const wallet = w.nightly?.aptos || w.nightly?.movement;
  
  if (!wallet) {
    console.error('Nightly wallet does not have aptos/movement namespace');
    return null;
  }
  
  return wallet;
}

/**
 * Connect to Nightly wallet for Movement Network
 */
export async function connectWallet(
  walletType: WalletType = 'nightly'
): Promise<string> {
  try {
    // Check if wallet is installed
    const wallet = getWalletProvider(walletType);
    
    if (!wallet) {
      throw new Error(
        'Nightly wallet not found. Please install Nightly wallet extension from https://nightly.app/'
      );
    }
    
    // Debug: log available methods on wallet
    console.log('Wallet object:', wallet);
    console.log('Wallet methods:', Object.keys(wallet));
    
    let address: string | undefined;
    
    // Try different connection methods (different wallets use different APIs)
    if (typeof wallet.connect === 'function') {
      // Standard Aptos wallet adapter (Petra, etc.)
      const response = await wallet.connect();
      address = response?.address || response?.publicKey;
    } else if (typeof wallet.enable === 'function') {
      // Some wallets use enable()
      const accounts = await wallet.enable();
      address = Array.isArray(accounts) ? accounts[0] : accounts;
    } else if (typeof wallet.requestAccounts === 'function') {
      // EIP-1193 style
      const accounts = await wallet.requestAccounts();
      address = Array.isArray(accounts) ? accounts[0] : accounts;
    } else if (typeof wallet.account === 'function') {
      // Direct account access
      const account = await wallet.account();
      address = account?.address || account?.publicKey || account;
    } else if (wallet.account) {
      // Some wallets expose account directly
      address = wallet.account?.address || wallet.account;
    } else if (wallet.address) {
      // Direct address property
      address = wallet.address;
    } else {
      // Log all available properties for debugging
      const props = Object.getOwnPropertyNames(wallet);
      console.error('Unknown wallet API. Available properties:', props.join(', '));
      
      // Also log each property's type and value
      props.forEach(prop => {
        const val = (wallet as any)[prop];
        console.log(`  - ${prop}: (${typeof val})`, val);
      });
      
      throw new Error(`Unknown wallet API. Properties: ${props.join(', ')}`);
    }
    
    if (!address) {
      throw new Error('Failed to get wallet address');
    }
    
    // Update wallet state
    walletState = {
      connected: true,
      address: address,
      walletType,
    };
    
    // Persist to localStorage
    saveWalletState(walletState);
    
    console.log(`✅ Connected to ${walletType}:`, address);
    
    return address;
  } catch (error: any) {
    console.error('Wallet connection failed:', error);
    throw error;
  }
}

/**
 * Disconnect wallet
 */
export async function disconnectWallet(): Promise<void> {
  try {
    const wallet = getWalletProvider(walletState.walletType || 'nightly');
    
    if (wallet?.disconnect) {
      await wallet.disconnect();
    }
    
    walletState = {
      connected: false,
      address: null,
      walletType: null,
    };
    
    // Clear from localStorage
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear wallet state:', error);
    }
    
    console.log('✅ Wallet disconnected');
  } catch (error: any) {
    console.error('Wallet disconnection failed:', error);
  }
}

/**
 * Get current wallet state
 */
export function getWalletState(): WalletState {
  return { ...walletState };
}

/**
 * Verify wallet is still connected and restore state if needed
 * Call this on page load to restore connection
 */
export async function restoreWalletConnection(): Promise<boolean> {
  const stored = loadWalletState();
  if (!stored.connected || !stored.address || !stored.walletType) {
    return false;
  }

  // Wait a bit for wallet extension to initialize (especially on page refresh)
  // Retry up to 3 times with increasing delays
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, 200 * attempt)); // 200ms, 400ms delays
    }

    try {
      // Verify wallet is still available and connected
      const wallet = getWalletProvider(stored.walletType);
      if (!wallet) {
        // Wallet not available - but don't clear state yet, might still be initializing
        if (attempt === 2) {
          // Last attempt failed, wallet really not available
          console.warn('Wallet not available after retries, but keeping state in case wallet loads later');
          // Don't clear state - user might have wallet installed but it's slow to load
          return false;
        }
        continue; // Retry
      }

      // Try to get current account
      let currentAddress: string | undefined;
      try {
        if (typeof wallet.getAccount === 'function') {
          const account = await wallet.getAccount();
          currentAddress = account?.address || account;
        } else if (wallet.account) {
          currentAddress = wallet.account?.address || wallet.account;
        } else if (wallet.address) {
          currentAddress = wallet.address;
        }
      } catch (e) {
        // getAccount might throw if wallet isn't ready - that's okay, we'll retry
        console.log(`Attempt ${attempt + 1}: Could not get account yet, retrying...`);
        if (attempt < 2) continue;
      }

      // If we got an address and it matches, restore connection
      if (currentAddress && currentAddress.toLowerCase() === stored.address.toLowerCase()) {
        walletState = stored;
        console.log('✅ Wallet connection restored:', stored.address);
        return true;
      }

      // If we got an address but it doesn't match, wallet account changed
      if (currentAddress && currentAddress.toLowerCase() !== stored.address.toLowerCase()) {
        console.warn('Wallet address changed, updating stored address');
        walletState = {
          connected: true,
          address: currentAddress,
          walletType: stored.walletType,
        };
        saveWalletState(walletState);
        return true;
      }

      // If we couldn't get address but wallet exists, assume it's still connected
      // (wallet might not expose address until user interacts, but connection persists)
      if (wallet && attempt === 2) {
        console.log('✅ Wallet available, restoring connection (address verification skipped)');
        walletState = stored;
        return true;
      }

      // If we're not on the last attempt, continue retrying
      if (attempt < 2) continue;
    } catch (error) {
      console.log(`Attempt ${attempt + 1} failed:`, error);
      if (attempt === 2) {
        // Last attempt failed - but don't clear state, wallet might still be connected
        // Just can't verify right now
        console.warn('Could not verify wallet connection, but keeping state');
        // Restore state anyway - better to assume connected than disconnected
        walletState = stored;
        return true;
      }
      continue; // Retry
    }
  }

  // If we get here, we couldn't verify but wallet might still be connected
  // Be lenient - restore the connection state
  console.log('✅ Restoring wallet connection (verification incomplete)');
  walletState = stored;
  return true;
}

/**
 * Sign and submit x402 payment transaction
 */
export async function signX402Payment(paymentRequest: {
  amount: string;
  recipient: string;
  description: string;
}): Promise<string> {
  // Reset any cached state - ensure fresh transaction
  let result: any = undefined;
  let builtTransaction: any = null;
  
  try {
    if (!walletState.connected) {
      throw new Error('Wallet not connected');
    }
    
    // Get a fresh wallet instance each time to avoid cached state
    const wallet = getWalletProvider(walletState.walletType || 'nightly');
    
    if (!wallet) {
      throw new Error('Nightly wallet not available. Please install Nightly wallet extension.');
    }
    
    console.log('🔐 Preparing payment transaction...');
    console.log('Wallet state:', walletState);
    console.log('Wallet object:', wallet);
    console.log('Wallet methods:', wallet ? Object.keys(wallet) : 'N/A');
    
    // Small delay to ensure wallet is ready (especially after previous transaction)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if wallet has account/address methods
    let currentAddress: string | undefined;
    try {
      if (typeof wallet.getAccount === 'function') {
        const account = await wallet.getAccount();
        currentAddress = account?.address || account;
        console.log('Current wallet address (from getAccount):', currentAddress);
      } else if (wallet.account) {
        currentAddress = wallet.account?.address || wallet.account;
        console.log('Current wallet address (from account):', currentAddress);
      } else if (wallet.address) {
        currentAddress = wallet.address;
        console.log('Current wallet address (from address):', currentAddress);
      }
    } catch (e) {
      console.warn('Could not get current wallet address:', e);
    }
    
    // Parse the amount (in octas) - MUST be string for Move u64
    const amountNum = parseInt(paymentRequest.amount, 10);
    const amountStr = String(amountNum); // Move u64 expects string!
    const amountInMove = amountNum / 100000000;
    console.log(`Payment amount: ${amountNum} octas (${amountInMove} MOVE)`);
    console.log(`Recipient: ${paymentRequest.recipient}`);
    
    // Sign and submit
    if (typeof wallet.signAndSubmitTransaction !== 'function') {
      console.error('Wallet does not have signAndSubmitTransaction method');
      console.error('Available methods:', Object.keys(wallet));
      throw new Error('Wallet does not support transaction signing. Please ensure Nightly wallet is properly installed and connected.');
    }
    
    console.log('✅ Wallet ready, attempting transaction...');
    
    // Try different payload formats - Nightly wallet might need a specific format
    // Start with the simplest format that should work
    const txPayload = {
      type: 'entry_function_payload',
      function: '0x1::aptos_account::transfer',
      type_arguments: [],
      arguments: [paymentRequest.recipient, amountStr],
    };
    
    // If we have the address, try building the transaction with SDK first
    // Some wallets expect a built transaction object
    // Build fresh each time - don't reuse
    if (currentAddress) {
      try {
        console.log('Attempting to build transaction with Aptos SDK...');
        const aptos = getAptosClient();
        builtTransaction = await aptos.transaction.build.simple({
          sender: currentAddress,
          data: {
            function: '0x1::aptos_account::transfer',
            functionArguments: [paymentRequest.recipient, amountStr],
          },
        });
        console.log('✅ Transaction built with SDK');
      } catch (buildError: any) {
        console.warn('Could not build transaction with SDK (this is okay, will use raw payload):', buildError.message);
        // Continue with raw payload - this is fine
      }
    }
    
    // Try built transaction first if available, otherwise use raw payload
    const transactionToSign = builtTransaction || txPayload;
    console.log('Sending transaction:', builtTransaction ? 'Built transaction object' : 'Raw payload format');
    console.log('Transaction details:', JSON.stringify(transactionToSign, null, 2));
    
    try {
      // Try with built transaction first if available
      result = await wallet.signAndSubmitTransaction(transactionToSign);
      
      // Check if result indicates rejection BEFORE trying alternatives
      if (result && typeof result === 'object' && result.status === 'Rejected') {
        console.error('Transaction rejected by wallet:', JSON.stringify(result, null, 2));
        const errorMsg = result?.error || result?.message || result?.reason || '';
        throw new Error(`Transaction was rejected by your wallet. ${errorMsg ? `Reason: ${errorMsg}` : 'Please approve the transaction when prompted in your wallet popup.'}`);
      }
    } catch (e1: any) {
      // If it's already a rejection error we threw, re-throw it
      if (e1.message && e1.message.includes('rejected by your wallet')) {
        throw e1;
      }
      
      console.log('Standard format failed:', e1.message);
      console.log('Error details:', e1);
      
      // Check if this is a user rejection (common error messages)
      const errorMsg = e1.message || e1.toString() || '';
      const isUserRejection = errorMsg.includes('reject') || 
                             errorMsg.includes('denied') || 
                             errorMsg.includes('cancel') ||
                             errorMsg.includes('User rejected') ||
                             e1.code === 4001; // Standard rejection code
      
      if (isUserRejection) {
        throw new Error('Transaction was cancelled. Please approve the transaction when prompted in your wallet popup.');
      }
      
      // Try alternative nested format
      const altPayload = {
        payload: {
          function: '0x1::aptos_account::transfer',
          typeArguments: [],
          functionArguments: [paymentRequest.recipient, amountStr],
        }
      };
      
      console.log('Trying nested format:', JSON.stringify(altPayload, null, 2));
      
      try {
        result = await wallet.signAndSubmitTransaction(altPayload);
        
        // Check if result indicates rejection BEFORE trying more alternatives
        if (result && typeof result === 'object' && result.status === 'Rejected') {
          console.error('Transaction rejected by wallet:', JSON.stringify(result, null, 2));
          const errorMsg = result?.error || result?.message || result?.reason || '';
          throw new Error(`Transaction was rejected by your wallet. ${errorMsg ? `Reason: ${errorMsg}` : 'Please approve the transaction when prompted in your wallet popup.'}`);
        }
      } catch (e2: any) {
        // If it's already a rejection error we threw, re-throw it
        if (e2.message && e2.message.includes('rejected by your wallet')) {
          throw e2;
        }
        
        console.log('Nested format failed:', e2.message);
        console.log('Error details:', e2);
        
        // Check if this is a user rejection
        const errorMsg2 = e2.message || e2.toString() || '';
        const isUserRejection2 = errorMsg2.includes('reject') || 
                                errorMsg2.includes('denied') || 
                                errorMsg2.includes('cancel') ||
                                errorMsg2.includes('User rejected') ||
                                e2.code === 4001;
        
        if (isUserRejection2) {
          throw new Error('Transaction was cancelled. Please approve the transaction when prompted in your wallet popup.');
        }
        
        // Try inner payload only
        try {
          console.log('Trying inner payload only...');
          result = await wallet.signAndSubmitTransaction(altPayload.payload);
          
          // Check if result indicates rejection
          if (result && typeof result === 'object' && result.status === 'Rejected') {
            console.error('Transaction rejected by wallet:', JSON.stringify(result, null, 2));
            const errorMsg = result?.error || result?.message || result?.reason || '';
            throw new Error(`Transaction was rejected by your wallet. ${errorMsg ? `Reason: ${errorMsg}` : 'Please approve the transaction when prompted in your wallet popup.'}`);
          }
        } catch (e3: any) {
          // If it's already a rejection error we threw, re-throw it
          if (e3.message && e3.message.includes('rejected by your wallet')) {
            throw e3;
          }
          console.error('All transaction formats failed');
          console.error('Error 1 (standard):', e1.message, e1);
          console.error('Error 2 (nested):', e2.message, e2);
          console.error('Error 3 (inner):', e3.message, e3);
          
          // Check if this is a user rejection
          const errorMsg3 = e3.message || e3.toString() || '';
          const isUserRejection3 = errorMsg3.includes('reject') || 
                                  errorMsg3.includes('denied') || 
                                  errorMsg3.includes('cancel') ||
                                  errorMsg3.includes('User rejected') ||
                                  e3.code === 4001;
          
          if (isUserRejection3) {
            throw new Error('Transaction was cancelled. Please approve the transaction when prompted in your wallet popup.');
          }
          
          // Provide more helpful error message
          let errorMessage = `Transaction failed: ${e1.message || 'Unknown error'}`;
          if (errorMsg.includes('network') || errorMsg.includes('Network')) {
            errorMessage += '\n\nPlease ensure your wallet is connected to Movement Testnet.';
          } else if (errorMsg.includes('insufficient') || errorMsg.includes('balance')) {
            errorMessage += '\n\nYou may not have sufficient balance for this transaction.';
          } else {
            errorMessage += '\n\nPlease check your wallet and ensure it is connected to Movement Testnet.';
          }
          
          throw new Error(errorMessage);
        }
      }
    }
    
    // If result is undefined or null, it means all transaction attempts failed
    if (!result) {
      throw new Error('Transaction failed: No response from wallet. Please check your wallet and ensure it is connected to Movement Testnet.');
    }
    
    console.log('Transaction result:', result);
    console.log('Transaction result keys:', result ? Object.keys(result) : 'null');
    console.log('Transaction result type:', typeof result);
    console.log('Full result object:', JSON.stringify(result, null, 2));
    
    // Check if transaction was rejected (only if we have a result object with explicit rejection status)
    // Note: If the wallet throws an error instead of returning a result, it's handled in the catch blocks above
    if (result && typeof result === 'object' && result.status === 'Rejected') {
      console.error('Transaction rejected by wallet:', JSON.stringify(result, null, 2));
      // Check if there's additional error info
      const errorMsg = result?.error || result?.message || result?.reason || '';
      throw new Error(`Transaction was rejected by your wallet. ${errorMsg ? `Reason: ${errorMsg}` : 'Please approve the transaction when prompted in your wallet popup.'}`);
    }
    
    // Check if transaction is pending or approved but no hash yet
    if (result?.status === 'Pending' || result?.status === 'Approved') {
      console.log(`Transaction status: ${result.status}`);
      // Some wallets return the hash immediately even with pending status
      if (result.hash) {
        console.log('Hash found in result:', result.hash);
        return result.hash;
      }
    }
    
    // Try multiple possible hash field names and nested structures
    let txnHash = result?.hash || 
                  result?.txnHash || 
                  result?.transactionHash ||
                  result?.transaction_hash ||
                  result?.txHash ||
                  result?.tx_hash ||
                  result?.data?.hash ||
                  result?.transaction?.hash ||
                  (typeof result === 'string' ? result : '');
    
    // If still no hash, recursively search nested objects
    if (!txnHash && result && typeof result === 'object') {
      const findHash = (obj: any, depth = 0): string | null => {
        if (depth > 3) return null; // Prevent infinite recursion
        if (typeof obj !== 'object' || obj === null) return null;
        if (obj.hash) return String(obj.hash);
        if (obj.txnHash) return String(obj.txnHash);
        if (obj.transactionHash) return String(obj.transactionHash);
        for (const key in obj) {
          if (key !== 'status') { // Skip status to avoid loops
            const found = findHash(obj[key], depth + 1);
            if (found) return found;
          }
        }
        return null;
      };
      const foundHash = findHash(result);
      if (foundHash) txnHash = foundHash;
    }
    
    if (!txnHash) {
      console.error('Could not extract hash from result:', JSON.stringify(result, null, 2));
      
      // Provide more helpful error message - only show rejection if status is explicitly 'Rejected'
      if (result && typeof result === 'object' && result.status === 'Rejected') {
        const errorMsg = result?.error || result?.message || result?.reason || '';
        throw new Error(`Transaction was rejected by your wallet. ${errorMsg ? `Reason: ${errorMsg}` : 'Please check your wallet and approve the transaction.'}`);
      }
      
      if (result?.status) {
        throw new Error(`Transaction ${result.status.toLowerCase()}. ${result.status === 'Pending' ? 'The transaction may still be processing. Please check your wallet.' : 'No transaction hash was returned.'}`);
      }
      
      throw new Error(`No transaction hash returned. The wallet may have encountered an error. Please check your wallet popup and ensure it is connected to Movement Testnet. Result: ${JSON.stringify(result)}`);
    }
    
    console.log('✅ Payment transaction submitted:', txnHash);
    
    return txnHash;
  } catch (error: any) {
    console.error('Payment signing failed:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name,
      fullError: error,
    });
    
    // If the error message already contains helpful information, re-throw it as-is
    // Otherwise, provide a more helpful error message
    if (error.message && (
      error.message.includes('reject') ||
      error.message.includes('denied') ||
      error.message.includes('cancel') ||
      error.message.includes('Transaction was rejected') ||
      error.message.includes('Transaction was cancelled')
    )) {
      // This is already a user-friendly rejection message
      throw error;
    }
    
    // For other errors, provide context
    const errorMessage = error.message || 'Unknown error occurred';
    let helpfulMessage = `Transaction failed: ${errorMessage}`;
    
    if (errorMessage.includes('network') || errorMessage.includes('Network')) {
      helpfulMessage += '\n\nPlease ensure your Nightly wallet is connected to Movement Testnet.';
    } else if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
      helpfulMessage += '\n\nYou may not have sufficient balance for this transaction.';
    } else if (errorMessage.includes('popup') || errorMessage.includes('window')) {
      helpfulMessage += '\n\nPlease check if your browser blocked the wallet popup. You may need to allow popups for this site.';
    } else {
      helpfulMessage += '\n\nPlease check your wallet and ensure:\n1. Nightly wallet is installed and unlocked\n2. You are connected to Movement Testnet\n3. You have sufficient balance\n4. Your browser allows popups';
    }
    
    throw new Error(helpfulMessage);
  }
}

/**
 * Sign and submit a generic transaction via wallet
 */
export async function signTransaction(payload: {
  function: string;
  typeArguments: string[];
  functionArguments: any[];
}): Promise<string> {
  // Reset any cached state - ensure fresh transaction
  let result: any = undefined;
  
  try {
    if (!walletState.connected) {
      throw new Error('Wallet not connected');
    }
    
    // Get a fresh wallet instance each time to avoid cached state
    const wallet = getWalletProvider(walletState.walletType || 'nightly');
    
    if (!wallet) {
      throw new Error('Nightly wallet not available. Please install Nightly wallet extension.');
    }
    
    console.log('🔐 Preparing transaction...');
    console.log('Payload:', payload);
    
    // Small delay to ensure wallet is ready (especially after previous transaction)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Convert numeric arguments to strings (Move u64 expects string representation)
    const stringifiedArgs = payload.functionArguments.map(arg => 
      typeof arg === 'number' ? String(arg) : arg
    );
    
    // Parse function string to get module address, module name, and function name
    // Format: "0x123::module_name::function_name"
    const functionParts = payload.function.split('::');
    const moduleAddress = functionParts[0];
    const moduleName = functionParts[1];
    const functionName = functionParts[2];
    
    console.log('=== Transaction Details ===');
    console.log('Module Address:', moduleAddress);
    console.log('Module Name:', moduleName);
    console.log('Function Name:', functionName);
    console.log('Arguments:', stringifiedArgs);
    console.log('===========================');
    
    // Sign and submit
    if (typeof wallet.signAndSubmitTransaction !== 'function') {
      throw new Error('Wallet does not support transaction signing');
    }
    
    console.log('Wallet methods available:', Object.keys(wallet));
    
    // Check if wallet has specific Movement/Aptos methods
    const hasSignTransaction = typeof wallet.signTransaction === 'function';
    const hasSignAndSubmit = typeof wallet.signAndSubmitTransaction === 'function';
    
    console.log('Wallet capabilities:', { hasSignTransaction, hasSignAndSubmit });
    
    // Nightly wallet expects a specific format - try the format that works for payments
    // Based on the payment flow, the nested format with functionArguments works
    const txPayload = {
      payload: {
        function: payload.function,
        typeArguments: payload.typeArguments,
        functionArguments: stringifiedArgs,
      }
    };
    
    console.log('Trying transaction with payload:', JSON.stringify(txPayload, null, 2));
    
    if (hasSignAndSubmit) {
      // Try the nested format first (this is what works for payments)
      try {
        result = await wallet.signAndSubmitTransaction(txPayload);
        
        // Check if result indicates rejection BEFORE trying alternatives
        if (result && typeof result === 'object' && result.status === 'Rejected') {
          console.error('Transaction rejected by wallet:', JSON.stringify(result, null, 2));
          const errorMsg = result?.error || result?.message || result?.reason || '';
          throw new Error(`Transaction was rejected by your wallet. ${errorMsg ? `Reason: ${errorMsg}` : 'Please approve the transaction when prompted in your wallet popup.'}`);
        }
      } catch (e1: any) {
        // If it's already a rejection error we threw, re-throw it
        if (e1.message && e1.message.includes('rejected by your wallet')) {
          throw e1;
        }
        
        console.log('Nested format failed:', e1.message);
        // Try with just the inner payload
        try {
          console.log('Trying inner payload only...');
          result = await wallet.signAndSubmitTransaction(txPayload.payload);
          
          // Check if result indicates rejection
          if (result && typeof result === 'object' && result.status === 'Rejected') {
            console.error('Transaction rejected by wallet:', JSON.stringify(result, null, 2));
            const errorMsg = result?.error || result?.message || result?.reason || '';
            throw new Error(`Transaction was rejected by your wallet. ${errorMsg ? `Reason: ${errorMsg}` : 'Please approve the transaction when prompted in your wallet popup.'}`);
          }
        } catch (e2: any) {
          // If it's already a rejection error we threw, re-throw it
          if (e2.message && e2.message.includes('rejected by your wallet')) {
            throw e2;
          }
          
          console.log('Inner payload failed:', e2.message);
          // Try standard Aptos format as last resort
          try {
            const standardPayload = {
              type: 'entry_function_payload',
              function: payload.function,
              type_arguments: payload.typeArguments,
              arguments: stringifiedArgs,
            };
            console.log('Trying standard format:', JSON.stringify(standardPayload, null, 2));
            result = await wallet.signAndSubmitTransaction(standardPayload);
            
            // Check if result indicates rejection
            if (result && typeof result === 'object' && result.status === 'Rejected') {
              console.error('Transaction rejected by wallet:', JSON.stringify(result, null, 2));
              const errorMsg = result?.error || result?.message || result?.reason || '';
              throw new Error(`Transaction was rejected by your wallet. ${errorMsg ? `Reason: ${errorMsg}` : 'Please approve the transaction when prompted in your wallet popup.'}`);
            }
          } catch (e3: any) {
            // If it's already a rejection error we threw, re-throw it
            if (e3.message && e3.message.includes('rejected by your wallet')) {
              throw e3;
            }
            
            console.log('Standard format failed:', e3.message);
            throw new Error(`All transaction formats failed. Last error: ${e1.message}. Please ensure your wallet is connected to Movement Testnet and the contract is deployed.`);
          }
        }
      }
    } else {
      throw new Error('Wallet does not support transaction signing');
    }
    console.log('Transaction result:', result);
    console.log('Transaction result keys:', result ? Object.keys(result) : 'null');
    console.log('Transaction result type:', typeof result);
    console.log('Full result object:', JSON.stringify(result, null, 2));
    
    // Check if transaction is pending or approved but no hash yet
    if (result?.status === 'Pending' || result?.status === 'Approved') {
      console.log(`Transaction status: ${result.status}`);
      // Some wallets return the hash immediately even with pending status
      if (result.hash) {
        console.log('Hash found in result:', result.hash);
        return result.hash;
      }
    }
    
    // Try multiple possible hash field names and nested structures
    let txnHash = result?.hash || 
                  result?.txnHash || 
                  result?.transactionHash ||
                  result?.transaction_hash ||
                  result?.txHash ||
                  result?.tx_hash ||
                  result?.data?.hash ||
                  result?.transaction?.hash ||
                  (typeof result === 'string' ? result : '');
    
    // If still no hash, recursively search nested objects
    if (!txnHash && result && typeof result === 'object') {
      const findHash = (obj: any, depth = 0): string | null => {
        if (depth > 3) return null; // Prevent infinite recursion
        if (typeof obj !== 'object' || obj === null) return null;
        if (obj.hash) return String(obj.hash);
        if (obj.txnHash) return String(obj.txnHash);
        if (obj.transactionHash) return String(obj.transactionHash);
        for (const key in obj) {
          if (key !== 'status') { // Skip status to avoid loops
            const found = findHash(obj[key], depth + 1);
            if (found) return found;
          }
        }
        return null;
      };
      const foundHash = findHash(result);
      if (foundHash) txnHash = foundHash;
    }
    
    if (!txnHash) {
      console.error('Could not extract hash from result:', JSON.stringify(result, null, 2));
      
      // Provide more helpful error message
      if (result?.status === 'Rejected') {
        const errorMsg = result?.error || result?.message || result?.reason || '';
        throw new Error(`Transaction was rejected by your wallet. ${errorMsg ? `Reason: ${errorMsg}` : 'Please check your wallet and approve the transaction.'}`);
      }
      
      if (result?.status) {
        throw new Error(`Transaction ${result.status.toLowerCase()}. ${result.status === 'Pending' ? 'The transaction may still be processing. Please check your wallet.' : 'No transaction hash was returned.'}`);
      }
      
      throw new Error(`No transaction hash returned. The wallet may have rejected the transaction or there was an error. Please check your wallet popup. Result: ${JSON.stringify(result)}`);
    }
    
    console.log('✅ Transaction submitted:', txnHash);
    
    return txnHash;
  } catch (error: any) {
    console.error('Transaction signing failed:', error);
    
    // Extract detailed error message
    let errorMessage = error.message || 'Transaction failed';
    
    // Check for simulation errors
    if (errorMessage.includes('simulation') || errorMessage.includes('SIMULATION')) {
      errorMessage = `Simulation failed: ${errorMessage}\n\nThis usually means:\n1. Contract not deployed on this network\n2. Wrong network selected in wallet\n3. Insufficient balance for stake`;
    }
    
    // Check for module not found
    if (errorMessage.includes('MODULE_NOT_FOUND') || errorMessage.includes('FUNCTION_NOT_FOUND')) {
      errorMessage = `Contract not found: The provider_registry contract may not be deployed on this network.\n\nMake sure Nightly wallet is connected to Movement Testnet.`;
    }
    
    throw new Error(errorMessage);
  }
}

/**
 * Check if Nightly wallet is available
 */
export function isWalletAvailable(): boolean {
  const w = window as any;
  const available = typeof w.nightly !== 'undefined' && 
                   (typeof w.nightly.aptos !== 'undefined' || typeof w.nightly.movement !== 'undefined');
  
  console.log('Nightly wallet available:', available);
  return available;
}

/**
 * Get Nightly wallet installation URL
 */
export function getWalletInstallUrl(_walletType: WalletType = 'nightly'): string {
  return 'https://nightly.app/';
}


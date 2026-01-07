/**
 * Movement Wallet Integration
 * Handles wallet connection and payment signing for x402
 */

// Wallet types supported
export type WalletType = 'petra' | 'movement' | 'pontem' | 'robin' | 'razor' | 'nightly';

// Wallet state
interface WalletState {
  connected: boolean;
  address: string | null;
  walletType: WalletType | null;
}

let walletState: WalletState = {
  connected: false,
  address: null,
  walletType: null,
};

/**
 * Get wallet provider based on type
 * Different wallets inject with different names
 */
function getWalletProvider(walletType: WalletType): any {
  const w = window as any;
  
  // Debug: log available wallet providers
  console.log('Available wallets:', {
    aptos: !!w.aptos,
    petra: !!w.petra,
    razor: !!w.razor,
    'razor.aptos': !!w.razor?.aptos,
    razorWallet: !!w.razorWallet,
    robin: !!w.robin,
    pontem: !!w.pontem,
    movement: !!w.movement,
    martian: !!w.martian,
    nightly: !!w.nightly,
  });
  
  switch (walletType) {
    case 'nightly':
      // Nightly wallet exposes chain-specific APIs
      // For Movement (Move-based), use the aptos namespace
      console.log('Nightly wallet namespaces:', w.nightly ? Object.keys(w.nightly) : 'not found');
      return w.nightly?.aptos || w.nightly?.movement || w.aptos;
    case 'razor':
      // Razor wallet exposes methods under razor.aptos namespace!
      return w.razor?.aptos || w.razorWallet?.aptos || w.razor || w.razorWallet || w.aptos;
    case 'robin':
      return w.robin || w.aptos;
    case 'petra':
      return w.petra || w.aptos;
    case 'pontem':
      return w.pontem || w.aptos;
    case 'movement':
      return w.movement || w.aptos;
    default:
      // Try all known wallet providers (check namespaced versions first)
      // Nightly uses chain-specific namespaces (nightly.aptos for Move-based chains)
      return w.nightly?.aptos || w.razor?.aptos || w.aptos || w.petra || w.razor || w.razorWallet || w.robin || w.pontem || w.martian;
  }
}

/**
 * Connect to Movement wallet (Petra, Razor, Robin, etc.)
 */
export async function connectWallet(
  walletType: WalletType = 'razor'
): Promise<string> {
  try {
    // Check if wallet is installed
    const wallet = getWalletProvider(walletType);
    
    if (!wallet) {
      throw new Error(
        `${walletType} wallet not found. Please install a compatible wallet extension.`
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
    const wallet = getWalletProvider(walletState.walletType || 'robin');
    
    if (wallet?.disconnect) {
      await wallet.disconnect();
    }
    
    walletState = {
      connected: false,
      address: null,
      walletType: null,
    };
    
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
 * Sign and submit x402 payment transaction
 */
export async function signX402Payment(paymentRequest: {
  amount: string;
  recipient: string;
  description: string;
}): Promise<string> {
  try {
    if (!walletState.connected) {
      throw new Error('Wallet not connected');
    }
    
    const wallet = getWalletProvider(walletState.walletType || 'razor');
    
    if (!wallet) {
      throw new Error('Wallet not available');
    }
    
    console.log('🔐 Preparing payment transaction...');
    
    // Ensure amount is a number (use smaller amount for testing)
    let amountNum = parseInt(paymentRequest.amount, 10);
    // Cap at 1 MOVE for testing to avoid insufficient balance issues
    if (amountNum > 100000000) {
      console.log(`Reducing amount from ${amountNum} to 100000000 (1 MOVE) for testing`);
      amountNum = 100000000; // 1 MOVE
    }
    
    // Use aptos_account::transfer (auto-registers recipient, simpler)
    // Convert amount to string (some wallets require this)
    const payload = {
      payload: {
        type: 'entry_function_payload',
        function: '0x1::aptos_account::transfer',
        type_arguments: [],
        arguments: [paymentRequest.recipient, String(amountNum)],
      }
    };
    
    console.log('Sending transaction:', payload);
    
    // Sign and submit
    if (typeof wallet.signAndSubmitTransaction !== 'function') {
      throw new Error('Wallet does not support transaction signing');
    }
    
    const result = await wallet.signAndSubmitTransaction(payload);
    console.log('Transaction result:', result);
    const txnHash = result?.hash || result?.txnHash || (typeof result === 'string' ? result : '');
    
    if (!txnHash) {
      throw new Error('No transaction hash returned');
    }
    
    if (!txnHash) {
      throw new Error('No transaction hash returned from wallet');
    }
    
    console.log('✅ Payment transaction submitted:', txnHash);
    
    return txnHash;
  } catch (error: any) {
    console.error('Payment signing failed:', error);
    throw error;
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
  try {
    if (!walletState.connected) {
      throw new Error('Wallet not connected');
    }
    
    const wallet = getWalletProvider(walletState.walletType || 'razor');
    
    if (!wallet) {
      throw new Error('Wallet not available');
    }
    
    console.log('🔐 Preparing transaction...');
    console.log('Payload:', payload);
    
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
    
    // Build transaction payload - Nightly/Aptos wallets expect this format
    const txPayload = {
      type: 'entry_function_payload',
      function: payload.function,
      type_arguments: payload.typeArguments,
      arguments: stringifiedArgs,
    };
    
    // Alternative format for some wallets (Nightly uses this)
    const altPayload = {
      payload: {
        function: payload.function,
        typeArguments: payload.typeArguments,
        functionArguments: stringifiedArgs,
      }
    };
    
    console.log('Trying transaction with payload:', JSON.stringify(txPayload, null, 2));
    
    let result;
    
    if (hasSignAndSubmit) {
      // Try standard format first
      try {
        result = await wallet.signAndSubmitTransaction(txPayload);
      } catch (e1: any) {
        console.log('Standard format failed:', e1.message);
        // Try alternative format
        try {
          console.log('Trying alternative format:', JSON.stringify(altPayload, null, 2));
          result = await wallet.signAndSubmitTransaction(altPayload);
        } catch (e2: any) {
          console.log('Alternative format failed:', e2.message);
          // Try with just the inner payload
          try {
            console.log('Trying inner payload only...');
            result = await wallet.signAndSubmitTransaction(altPayload.payload);
          } catch (e3: any) {
            console.log('Inner payload failed:', e3.message);
            throw e1; // Throw original error
          }
        }
      }
    } else {
      throw new Error('Wallet does not support transaction signing');
    }
    console.log('Transaction result:', result);
    const txnHash = result?.hash || result?.txnHash || (typeof result === 'string' ? result : '');
    
    if (!txnHash) {
      throw new Error('No transaction hash returned');
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
      errorMessage = `Contract not found: The provider_registry contract may not be deployed on this network.\n\nMake sure Razor Wallet is connected to Movement Testnet.`;
    }
    
    throw new Error(errorMessage);
  }
}

/**
 * Check if wallet is available
 */
export function isWalletAvailable(): boolean {
  const w = window as any;
  const available = typeof w.aptos !== 'undefined' || 
         typeof w.petra !== 'undefined' ||
         typeof w.razor !== 'undefined' ||
         typeof w.razorWallet !== 'undefined' ||
         typeof w.robin !== 'undefined' ||
         typeof w.pontem !== 'undefined' ||
         typeof w.martian !== 'undefined' ||
         typeof w.nightly !== 'undefined';
  
  console.log('Wallet available check:', available);
  return available;
}

/**
 * Get wallet installation URL
 */
export function getWalletInstallUrl(walletType: WalletType = 'nightly'): string {
  const urls: Record<WalletType, string> = {
    nightly: 'https://nightly.app/',
    petra: 'https://petra.app/',
    movement: 'https://movementlabs.xyz/',
    pontem: 'https://pontem.network/pontem-wallet',
    robin: 'https://robinwallet.io/',
    razor: 'https://razorwallet.xyz/',
  };
  
  return urls[walletType] || urls.nightly;
}


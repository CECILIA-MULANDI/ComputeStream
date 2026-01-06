/**
 * Movement Wallet Integration
 * Handles wallet connection and payment signing for x402
 */

// Wallet types supported
export type WalletType = 'petra' | 'movement' | 'pontem' | 'robin' | 'razor';

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
      return w.razor?.aptos || w.aptos || w.petra || w.razor || w.razorWallet || w.robin || w.pontem || w.martian || w.nightly;
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
    console.log('Wallet type:', walletState.walletType);
    console.log('Payment:', paymentRequest);
    console.log('Wallet methods:', Object.keys(wallet));
    
    let txnHash: string = '';
  
    
    // Ensure amount is a number
    const amountNum = parseInt(paymentRequest.amount, 10);
    console.log('Amount (number):', amountNum);
    
    // Format 1: Standard Aptos wallet adapter format (legacy)
    const payloadV1 = {
      type: 'entry_function_payload',
      function: '0x1::aptos_account::transfer',
      type_arguments: [],
      arguments: [paymentRequest.recipient, amountNum],
    };
    
    // Format 2: Simplified payload (newer wallets like Razor)
    const payloadV2 = {
      function: '0x1::aptos_account::transfer',
      typeArguments: [],
      functionArguments: [paymentRequest.recipient, amountNum],
    };
    
    // Format 3: Coin transfer (alternative function)
    const payloadV3 = {
      function: '0x1::coin::transfer',
      typeArguments: ['0x1::aptos_coin::AptosCoin'],
      functionArguments: [paymentRequest.recipient, amountNum],
    };
    
    console.log('Trying transaction formats...');
    console.log('PayloadV2:', JSON.stringify(payloadV2));
    
    // Try different transaction signing methods
    if (typeof wallet.signAndSubmitTransaction === 'function') {
      // Try formats in order until one works
      const formats = [
        { name: 'v2 (aptos_account::transfer)', payload: payloadV2 },
        { name: 'v3 (coin::transfer)', payload: payloadV3 },
        { name: 'v1 (legacy)', payload: payloadV1 },
      ];
      
      let lastError: any;
      for (const format of formats) {
        try {
          console.log(`Trying ${format.name}...`, format.payload);
          const result = await wallet.signAndSubmitTransaction(format.payload);
          console.log(`✅ ${format.name} succeeded:`, result);
          txnHash = result?.hash || result?.txnHash || (typeof result === 'string' ? result : '');
          if (txnHash) break;
        } catch (e: any) {
          console.log(`❌ ${format.name} failed:`, e.message);
          lastError = e;
        }
      }
      
      if (!txnHash && lastError) {
        throw lastError;
      }
    } else if (typeof wallet.signTransaction === 'function') {
      console.log('Using signTransaction...');
      throw new Error('Wallet only supports signTransaction - signAndSubmitTransaction required');
    } else {
      console.error('Wallet has no known signing method. Available:', Object.keys(wallet));
      throw new Error('Wallet does not support transaction signing');
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
export function getWalletInstallUrl(walletType: WalletType = 'razor'): string {
  const urls: Record<WalletType, string> = {
    petra: 'https://petra.app/',
    movement: 'https://movementlabs.xyz/',
    pontem: 'https://pontem.network/pontem-wallet',
    robin: 'https://robinwallet.io/',
    razor: 'https://razorwallet.xyz/',
  };
  
  return urls[walletType] || urls.razor;
}


import { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import "dotenv/config";
import got from "got";
import dns from "dns";

// Force IPv4 first - IPv6 connections to Movement Network timeout
dns.setDefaultResultOrder('ipv4first');

// Create a custom got client with longer timeouts and IPv4 for slow RPC endpoints
const customGotClient = got.extend({
  timeout: {
    request: 60000, // 60 seconds total
    connect: 30000,
    secureConnect: 30000,
    socket: 60000,
    send: 30000,
    response: 60000,
  },
  retry: {
    limit: 3,
    methods: ['GET', 'POST'],
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
  },
  dnsLookupIpVersion: 'ipv4' as const, // Force IPv4 - IPv6 connections to Movement Network timeout
});

// Custom client provider for AptosConfig
// The SDK passes URLs without /v1, we need to insert it after the domain
const customClient = {
  provider: async (requestOptions: any) => {
    const { params, method, url, headers, body } = requestOptions;
    
    // Insert /v1 after the domain if not present
    let requestUrl = url;
    if (!requestUrl.includes('/v1/')) {
      // Insert /v1 after the domain (e.g., after https://testnet.movementnetwork.xyz)
      requestUrl = requestUrl.replace(/(https?:\/\/[^\/]+)(\/?)/, '$1/v1/');
      // Clean up any double slashes (except in https://)
      requestUrl = requestUrl.replace(/([^:])\/\//g, '$1/');
    }
    
    console.log(`[CustomClient] ${method} ${requestUrl}`);
    
    const request: any = {
      searchParams: params,
      method,
      url: requestUrl,
      responseType: 'json',
      headers,
      http2: false, // Disable HTTP/2 - can cause timeout issues with some servers
    };

    if (body) {
      if (body instanceof Uint8Array) {
        request.body = Buffer.from(body);
      } else {
        request.body = Buffer.from(JSON.stringify(body));
      }
    }
    
    try {
      const response = await customGotClient(request);
      return {
        status: response.statusCode,
        statusText: response.statusMessage || '',
        data: response.body,
        headers: response.headers,
        config: requestOptions,
        request: response.request,
      };
    } catch (error: any) {
      console.error(`[CustomClient] Error: ${error.message}`);
      if (error.response) {
        return {
          status: error.response.statusCode,
          statusText: error.response.statusMessage || '',
          data: error.response.body,
          headers: error.response.headers,
          config: requestOptions,
          request: error.request,
        };
      }
      throw error;
    }
  },
};

export class BlockchainService {
  private aptos: Aptos;
  private config: AptosConfig;
  
  //Contract address
  readonly CONTRACT_ADDRESS = "0x69fa4604bbf4e835e978b4d7ef1cfe365f589291428a9d6332b6cd9f4e5e8ff1";
  
  constructor() {
    let rpcUrl = process.env.MOVEMENT_RPC_URL;
    
    if (!rpcUrl) {
      throw new Error("MOVEMENT_RPC_URL is not set in environment variables");
    }
    
    // Trim whitespace (in case .env has spaces)
    rpcUrl = rpcUrl.trim();
    
    // Remove trailing slash if present
    rpcUrl = rpcUrl.replace(/\/$/, '');
    
    // The Aptos SDK appends /v1 to the fullnode URL for API calls
    // If the URL already ends with /v1, we should remove it to avoid double /v1/v1
    if (rpcUrl.endsWith('/v1')) {
      rpcUrl = rpcUrl.slice(0, -3);
      console.log(`Removed /v1 suffix from RPC URL. Using base URL: ${rpcUrl}`);
    }
    
    console.log(`Initializing blockchain service with RPC: ${rpcUrl}`);
    
    this.config = new AptosConfig({
      network: Network.CUSTOM,
      fullnode: rpcUrl,
      client: customClient,
    });
    
    this.aptos = new Aptos(this.config);
    console.log(`Using custom HTTP client with 60s timeout for slow RPC endpoints`);
    
    // Test connection on initialization to catch RPC issues early
    this.testConnection().then(result => {
      if (result.success) {
        console.log(`✅ Blockchain connection successful. Chain ID: ${result.chainId}, Block Height: ${result.blockHeight}`);
      } else {
        console.warn(`⚠️  Blockchain connection test failed. RPC endpoint may be unreachable: ${rpcUrl}`);
      }
    }).catch(err => {
      console.warn(`⚠️  Blockchain connection test error:`, err.message);
    });
  }
  
  /**
   * Get the Aptos client instance
   */
  getClient(): Aptos {
    return this.aptos;
  }
  
  /**
   * Call a view function on your smart contract
   */
  async callViewFunction(
    module: string,
    functionName: string,
    args: any[] = []
  ): Promise<any> {
    try {
      const result = await this.aptos.view({
        payload: {
          function: `${this.CONTRACT_ADDRESS}::${module}::${functionName}`,
          functionArguments: args,
        },
      });
      return result;
    } catch (error: any) {
      throw new Error(`View function call failed: ${error.message}`);
    }
  }
  
  /**
   * Build a transaction for entry functions
   */
  async buildTransaction(
    sender: Account,
    module: string,
    functionName: string,
    args: any[] = [],
    retries: number = 3
  ) {
    const functionFullName = `${this.CONTRACT_ADDRESS}::${module}::${functionName}` as `${string}::${string}::${string}`;
    console.log(`Building transaction: ${functionFullName}`);
    console.log(`Arguments:`, args);
    console.log(`Sender:`, sender.accountAddress.toString());
    
    let lastError: any;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`Retry attempt ${attempt}/${retries}...`);
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
        
        const transactionPromise = this.aptos.transaction.build.simple({
          sender: sender.accountAddress,
          data: {
            function: functionFullName,
            functionArguments: args,
          },
        });
        
        // 60 second timeout - Movement Network RPC can be slow
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout after 60 seconds')), 60000)
        );
        
        const transaction = await Promise.race([transactionPromise, timeoutPromise]);
        return transaction;
      } catch (error: any) {
        lastError = error;
        console.error(`Transaction build attempt ${attempt} failed:`, {
          message: error.message,
          code: error.code,
        });
        
        // If this is the last attempt, throw the error
        if (attempt === retries) {
          // Check for timeout/network errors
          if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT')) {
            throw new Error(
              `RPC connection timeout after ${retries} attempts: Unable to connect to Movement Network RPC endpoint (${this.config.fullnode}). ` +
              `The endpoint may be slow or unreachable. Please check your network connection and try again later. ` +
              `Original error: ${error.message || 'Connection timeout'}`
            );
          }
          
          const errorMessage = error.message || String(error);
          const errorDetails = error.response?.data || error.data || error.cause || error.error;
          const fullError = errorDetails 
            ? `${errorMessage} - Details: ${JSON.stringify(errorDetails, null, 2)}`
            : errorMessage;
            
          throw new Error(`Transaction build failed after ${retries} attempts: ${fullError}`);
        }
      }
    }
    
    // Should never reach here, but TypeScript needs it
    throw lastError;
  }
  
  /**
   * Sign and submit a transaction
   */
  async signAndSubmitTransaction(
    sender: Account,
    transaction: any
  ): Promise<string> {
    try {
      // Sign the transaction
      const senderAuthenticator = this.aptos.transaction.sign({
        signer: sender,
        transaction,
      });
      
      // Submit the transaction
      const pendingTxn = await this.aptos.transaction.submit.simple({
        transaction,
        senderAuthenticator,
      });
      
      return pendingTxn.hash;
    } catch (error: any) {
      throw new Error(`Transaction submission failed: ${error.message}`);
    }
  }
  
  /**
   * Complete transaction flow: build, sign, submit, and wait
   */
  async executeTransaction(
    sender: Account,
    module: string,
    functionName: string,
    args: any[] = [],
    waitForConfirmation: boolean = true
  ): Promise<{ hash: string; result?: any }> {
    try {
      // Build transaction
      const transaction = await this.buildTransaction(sender, module, functionName, args);
      
      // Sign and submit
      const txnHash = await this.signAndSubmitTransaction(sender, transaction);
      
      // Wait for confirmation if requested
      let result;
      if (waitForConfirmation) {
        result = await this.waitForTransaction(txnHash);
      }
      
      return { hash: txnHash, result };
    } catch (error: any) {
      // Preserve the original error message for better debugging
      const originalMessage = error.message || String(error);
      throw new Error(`Transaction execution failed: ${originalMessage}`);
    }
  }
  
  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(txnHash: string, timeout: number = 30000) {
    try {
      const result = await this.aptos.waitForTransaction({
        transactionHash: txnHash,
        options: {
          timeoutSecs: timeout / 1000,
        },
      });
      return result;
    } catch (error: any) {
      throw new Error(`Transaction wait failed: ${error.message}`);
    }
  }
  
  /**
   * Create account from private key (for server-side operations)
   * Private key should be in hex format (64 characters, no 0x prefix)
   */
  createAccountFromPrivateKey(privateKeyHex: string): Account {
    try {
      // Remove 0x prefix if present
      const cleanKey = privateKeyHex.startsWith("0x") 
        ? privateKeyHex.slice(2) 
        : privateKeyHex;
      
      const privateKey = new Ed25519PrivateKey(cleanKey);
      return Account.fromPrivateKey({ privateKey });
    } catch (error: any) {
      throw new Error(`Failed to create account from private key: ${error.message}`);
    }
  }
  
  /**
   * Get account info
   */
  async getAccountInfo(address: string) {
    try {
      return await this.aptos.getAccountInfo({ accountAddress: address });
    } catch (error: any) {
      throw new Error(`Failed to get account info: ${error.message}`);
    }
  }
  
  /**
   * Get account balance (in Octas - smallest unit)
   */
  async getAccountBalance(address: string): Promise<bigint> {
    try {
      const resources = await this.aptos.getAccountResources({
        accountAddress: address,
      });
      
      // Find the coin store resource
      const coinStore = resources.find(
        (resource) => resource.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
      );
      
      if (!coinStore) {
        return BigInt(0);
      }
      
      return BigInt((coinStore.data as any).coin.value);
    } catch (error: any) {
      throw new Error(`Failed to get account balance: ${error.message}`);
    }
  }
  
  /**
   * Test connection to the network
   */
  async testConnection(): Promise<{ success: boolean; chainId?: number; blockHeight?: string }> {
    try {
      const chainId = await this.aptos.getChainId();
      const ledgerInfo = await this.aptos.getLedgerInfo();
      
      return {
        success: true,
        chainId,
        blockHeight: ledgerInfo.block_height.toString(),
      };
    } catch (error: any) {
      return {
        success: false,
      };
    }
  }
}
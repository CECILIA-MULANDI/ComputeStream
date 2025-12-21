import { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import "dotenv/config";

export class BlockchainService {
  private aptos: Aptos;
  private config: AptosConfig;
  
  //Contract address
  readonly CONTRACT_ADDRESS = "0xd6d9d27d944417f05fd2d2d84900ff379d0b7d7d00811bfe08ceedf0e64288b9";
  
  constructor() {
    const rpcUrl = process.env.MOVEMENT_RPC_URL;
    
    if (!rpcUrl) {
      throw new Error("MOVEMENT_RPC_URL is not set in environment variables");
    }
    
    this.config = new AptosConfig({
      network: Network.CUSTOM,
      fullnode: rpcUrl,
    });
    
    this.aptos = new Aptos(this.config);
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
    args: any[] = []
  ) {
    try {
      const transaction = await this.aptos.transaction.build.simple({
        sender: sender.accountAddress,
        data: {
          function: `${this.CONTRACT_ADDRESS}::${module}::${functionName}`,
          functionArguments: args,
        },
      });
      return transaction;
    } catch (error: any) {
      throw new Error(`Transaction build failed: ${error.message}`);
    }
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
      throw new Error(`Transaction execution failed: ${error.message}`);
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
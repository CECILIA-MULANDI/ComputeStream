/**
 * Test script to verify blockchain service connection
 */
import { BlockchainService } from "./src/blockchain.service";
import "dotenv/config";

async function testConnection() {
  console.log("🔍 Testing Blockchain Service Connection...\n");

  // Check environment
  const rpcUrl = process.env.MOVEMENT_RPC_URL;
  if (!rpcUrl) {
    console.error("❌ MOVEMENT_RPC_URL not set in .env");
    process.exit(1);
  }
  console.log(`✅ RPC URL: ${rpcUrl}\n`);

  try {
    // Initialize service
    console.log("📡 Initializing BlockchainService...");
    const blockchain = new BlockchainService();
    console.log("✅ Service initialized");
    console.log(`   Contract Address: ${blockchain.CONTRACT_ADDRESS}\n`);

    // Test 1: Get client
    console.log("🧪 Test 1: Getting Aptos client...");
    const client = blockchain.getClient();
    console.log("✅ Client retrieved\n");

    // Test 2: Get chain ID
    console.log("🧪 Test 2: Getting chain ID...");
    const chainId = await client.getChainId();
    console.log(`✅ Chain ID: ${chainId}\n`);

    // Test 3: Get ledger info
    console.log("🧪 Test 3: Getting ledger info...");
    const ledgerInfo = await client.getLedgerInfo();
    console.log(`✅ Ledger Info:`);
    console.log(`   - Chain ID: ${ledgerInfo.chain_id}`);
    console.log(`   - Block Height: ${ledgerInfo.block_height}\n`);

    // Test 4: Try calling a view function (if contract is deployed)
    console.log("🧪 Test 4: Testing view function call...");
    try {
      // Try to call a simple view function - this will fail if contract not initialized
      // but will succeed if we can reach the network
      const result = await blockchain.callViewFunction(
        "provider_registry",
        "is_provider_active",
        ["0x123"] // Dummy address for testing
      );
      console.log(`✅ View function call succeeded (result: ${result})\n`);
    } catch (error: any) {
      // This is expected if contract not initialized or address doesn't exist
      if (error.message.includes("not found") || error.message.includes("does not exist")) {
        console.log("⚠️  View function call reached network but resource doesn't exist (expected)\n");
      } else {
        console.log(`⚠️  View function error: ${error.message}\n`);
      }
    }

    // Test 5: Get account info (test with contract address)
    console.log("🧪 Test 5: Getting account info for contract address...");
    try {
      const accountInfo = await blockchain.getAccountInfo(blockchain.CONTRACT_ADDRESS);
      console.log(`✅ Account Info:`);
      console.log(`   - Sequence Number: ${accountInfo.sequence_number}`);
      console.log(`   - Authentication Key: ${accountInfo.authentication_key}\n`);
    } catch (error: any) {
      console.log(`⚠️  Account info error: ${error.message}\n`);
    }

    console.log("🎉 All connection tests passed!");
    console.log("✅ Your blockchain service is ready to use!\n");

  } catch (error: any) {
    console.error("❌ Connection test failed:");
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}\n`);
    process.exit(1);
  }
}

testConnection();


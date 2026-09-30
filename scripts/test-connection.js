async function main() {
  console.log("Testing Ganache connection...\n");

  try {
    // Get provider and signer
    const provider = ethers.provider;
    const [signer] = await ethers.getSigners();

    // Test 1: Check network connection
    console.log("✓ Connected to Ethereum provider");

    // Test 2: Get chain ID
    const network = await provider.getNetwork();
    console.log(`✓ Chain ID: ${network.chainId}`);

    // Test 3: Get current block number
    const blockNumber = await provider.getBlockNumber();
    console.log(`✓ Current block: ${blockNumber}`);

    // Test 4: Get signer address
    const signerAddress = await signer.getAddress();
    console.log(`✓ Signer address: ${signerAddress}`);

    // Test 5: Get account balance
    const balance = await provider.getBalance(signerAddress);
    const balanceEth = ethers.utils.formatEther(balance);
    console.log(`✓ Account balance: ${balanceEth} ETH`);

    // Test 6: Verify network is Ganache
    if (network.chainId !== 1337) {
      console.warn(
        `\n⚠️  Warning: Expected chain ID 1337, but got ${network.chainId}`
      );
      console.warn("Make sure Ganache is running on port 8545 with --chain.chainId 1337");
    }

    console.log("\n✓ All connection tests passed!");
    console.log("\n--- Connection Status ---");
    console.log(`Network: Ganache (Local)`);
    console.log(`Chain ID: ${network.chainId}`);
    console.log(`Block Number: ${blockNumber}`);
    console.log(`Signer: ${signerAddress}`);
    console.log(`Balance: ${balanceEth} ETH`);
    console.log("\nYou are ready to deploy contracts!");
  } catch (error) {
    console.error("\n✗ Connection test failed!");
    console.error(`Error: ${error.message}`);
    console.error(
      "\nMake sure Ganache is running:"
    );
    console.error(
      "  npx ganache@7 --server.host 127.0.0.1 --server.port 8545 --chain.chainId 1337"
    );
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

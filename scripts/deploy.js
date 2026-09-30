const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting CertificateRegistry deployment...\n");

  // Get the contract factory
  const CertificateRegistry = await ethers.getContractFactory("CertificateRegistry");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contract with account: ${deployer.address}`);

  // Deploy the contract
  const certificateRegistry = await CertificateRegistry.deploy(deployer.address);
  await certificateRegistry.deployed();

  console.log(`\n✓ CertificateRegistry deployed successfully!`);
  console.log(`Contract Address: ${certificateRegistry.address}`);
  console.log(`Deployer Address: ${deployer.address}`);

  // Save deployment info
  const deploymentInfo = {
    contractName: "CertificateRegistry",
    contractAddress: certificateRegistry.address,
    deployer: deployer.address,
    network: process.env.HARDHAT_NETWORK || "ganache",
    deploymentTime: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Save to JSON file
  const deploymentFile = path.join(
    deploymentsDir,
    `CertificateRegistry-${process.env.HARDHAT_NETWORK || "ganache"}.json`
  );
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  console.log(`\n✓ Deployment info saved to: ${deploymentFile}`);
  console.log("\n--- Deployment Summary ---");
  console.log(`Network: ${deploymentInfo.network}`);
  console.log(`Contract: ${deploymentInfo.contractName}`);
  console.log(`Address: ${deploymentInfo.contractAddress}`);
  console.log(`Deployer: ${deploymentInfo.deployer}`);
  console.log(`Block: ${deploymentInfo.blockNumber}`);
  console.log(`Time: ${deploymentInfo.deploymentTime}`);

  console.log("\n⚠️  NEXT STEPS:");
  console.log("1. Run npm run dev and open http://localhost:8080");
  console.log("2. The frontend loads the address from the deployment record automatically");
  console.log("3. Connect the deployer account in MetaMask to issue certificates");
  console.log("4. See Local_Connection.md for network setup and troubleshooting");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

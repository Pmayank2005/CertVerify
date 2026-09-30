const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Initializing data storage directories...\n");

  // Create data directory
  const dataDir = path.join(__dirname, "..", "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`✓ Created data directory: ${dataDir}`);
  } else {
    console.log(`✓ Data directory already exists: ${dataDir}`);
  }

  // Initialize certificates.json for off-chain storage
  const certificatesFile = path.join(dataDir, "certificates.json");
  if (!fs.existsSync(certificatesFile)) {
    fs.writeFileSync(certificatesFile, JSON.stringify({}, null, 2));
    console.log(`✓ Created certificates.json: ${certificatesFile}`);
  } else {
    console.log(`✓ certificates.json already exists: ${certificatesFile}`);
  }

  // Create deployments directory
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
    console.log(`✓ Created deployments directory: ${deploymentsDir}`);
  } else {
    console.log(`✓ Deployments directory already exists: ${deploymentsDir}`);
  }

  console.log("\n✓ Data storage initialization complete!");
  console.log("\nDirectory structure:");
  console.log("  data/");
  console.log("    └── certificates.json  (off-chain certificate data)");
  console.log("  deployments/");
  console.log("    └── (deployment info files)");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error initializing data storage:", error);
    process.exit(1);
  });

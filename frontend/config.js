/**
 * Frontend Configuration — Certificate Verification System
 *
 * Single source of truth for connecting the frontend to:
 *   1. The deployed CertificateRegistry smart contract
 *   2. The Ganache local blockchain (via MetaMask)
 *
 * See Local_Connection.md for usage.
 */

// ---------------------------------------------------------------------------
// Network settings (must match hardhat.config.js and MetaMask network config)
// ---------------------------------------------------------------------------
const CONFIG = {
  // Contract address from the latest deployment (deployments/CertificateRegistry-ganache.json)
  CONTRACT_ADDRESS: "0xBFa4fC57c8fD2e498353Ff695d435fb15E88f88f",

  // Ganache RPC endpoint
  RPC_URL: "http://127.0.0.1:8545",

  // Ganache chain ID
  CHAIN_ID: 1337,

  // Human-readable network name shown in the UI
  NETWORK_NAME: "Ganache Local",

  // Route (served by scripts/serve-frontend.js) used to auto-refresh the
  // contract address from the latest deployment record
  DEPLOYMENT_FILE: "/deployments/CertificateRegistry-ganache.json",
};

/**
 * Tries to load a fresher contract address from the deployment JSON file
 * (written by scripts/deploy.js). Falls back silently to the value above
 * when the page is opened via file:// or the file is unavailable.
 *
 * Call await CONFIG.loadDeployment() before instantiating the contract.
 */
CONFIG.loadDeployment = async function () {
  if (window.location.protocol === "file:") return; // fetch() blocked on file://
  try {
    const res = await fetch(CONFIG.DEPLOYMENT_FILE, { cache: "no-store" });
    if (!res.ok) return;
    const info = await res.json();
    if (info.contractAddress && info.contractAddress !== CONFIG.CONTRACT_ADDRESS) {
      console.log(
        `[config] Using deployed contract address ${info.contractAddress} ` +
        `(deployed ${info.deploymentTime}, was ${CONFIG.CONTRACT_ADDRESS})`
      );
      CONFIG.CONTRACT_ADDRESS = info.contractAddress;
    }
  } catch (err) {
    console.warn("[config] Could not load deployment info:", err.message);
  }
};

# Local connection guide

Follow the [README quick start](README.md#quick-start) to install dependencies, create `.env`, start Ganache, initialize storage, and deploy the contract.

## Connection settings

| Component | Setting | Default |
| --- | --- | --- |
| Hardhat and storage API | `GANACHE_RPC_URL` in `.env` | `http://127.0.0.1:8545` |
| Hardhat signer | `PRIVATE_KEY` in `.env` | Empty: use Ganache unlocked accounts |
| Browser RPC | `RPC_URL` in `frontend/config.js` | `http://127.0.0.1:8545` |
| Browser and Hardhat chain | `CHAIN_ID` / `chainId` | `1337` |
| Application server | `npm run dev -- --port 8080` | `http://localhost:8080` |
| Contract address | Generated deployment record | `deployments/CertificateRegistry-ganache.json` |

If you change the RPC endpoint, update both `.env` and `frontend/config.js`. If you change the chain ID, also update `hardhat.config.js` and MetaMask. Network ID and chain ID are distinct; the application checks chain ID 1337.

## Connect MetaMask

1. Add a custom network with RPC URL `http://127.0.0.1:8545`, chain ID `1337`, and currency symbol `ETH`.
2. Import the funded Ganache test account used by the deployment script. With an empty `PRIVATE_KEY`, this is normally Ganache's first account.
3. Open http://localhost:8080/issuer.html and connect that account.
4. Approve issuance or revocation transactions when prompted.

The deployer is the initial authorized issuer. Another funded account can connect, but cannot issue or revoke unless the current issuer transfers authority through the contract.

## Data and deployment lifecycle

`node scripts/init-data.js` creates an empty certificate store only when it does not exist. `npm run deploy` creates a new contract and replaces the deployment JSON for the selected network. Refresh the application after redeploying so it loads the new address.

The browser uses the bundled ABI in `frontend/abi.js`. If you change the Solidity interface, update this ABI as part of the change. Compilation alone does not regenerate the browser file.

Local records and blockchain state belong together. Back them up together with issued PDFs before resetting a demo. Old local records do not become valid on a newly deployed registry automatically.

## Manual smoke test

1. Start Ganache and the application server after deployment.
2. Connect the issuer account and create a certificate using fictional fields and a bundled template.
3. Save the issued PDF and verify that exact file on the verification page.
4. Verify the certificate ID and QR link while the matching local store is available.
5. Revoke the certificate from the issuer dashboard; verify that its status changes to revoked.
6. Connect a different Ganache account and confirm it cannot issue certificates.

These steps write blockchain transactions and local records. Perform them only on a disposable local demo or after backing up the matching state.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Cannot reach Ganache | Keep Ganache running on the configured host and port; run `npm run verify` |
| Wrong network | Use chain ID 1337 in Ganache, Hardhat, frontend configuration, and MetaMask |
| Unauthorized issuer | Connect the account that deployed the current registry |
| Missing contract or deployment | Run `npm run deploy` against the running chain and reload the page |
| Certificate ID not found | Confirm the matching local store exists; it is not included in GitHub |
| PDF verification fails | Use the exact registered PDF without resaving or editing it |
| Storage request fails | Use `npm run dev`; static hosting and opening files directly do not provide the API |
| Port 8080 in use | Start with `npm run dev -- --port 3000` and open that port |
| MetaMask transaction trouble after a chain reset | Check the current deployment and account transaction state before issuing again |

`npm run check` performs checks without requiring Ganache. The local test suite is excluded from GitHub by the current ignore rules; see the [README](README.md#commands) for validation commands.

# CertVerify

A local demonstration of blockchain-based academic certificate issuance and verification. The project combines a Solidity registry, a plain HTML/JavaScript frontend, MetaMask signing, and a Node.js server with a JSON certificate store.

Certificates created here are demonstration records, not genuine academic qualifications.

## Features

- Issue certificates from an uploaded PDF or generate PDFs from certificate fields.
- Choose from four bundled certificate designs, or use custom templates.
- Import CSV records for bulk issuance and download generated PDFs in a ZIP archive.
- Verify certificates by document, certificate ID, hash, or QR code.
- Revoke certificates using the authorized issuer account.
- Keep transaction references and certificate records in a local JSON store.

The deployed contract has one authorized issuer. Ganache runs the local development blockchain; a multi-institution consensus network is a proposed extension, not part of this implementation.

## Requirements

- Node.js 22 and npm for the documented setup.
- Ganache 7, installed separately or launched through `npx` below.
- MetaMask for issuing and revoking certificates. Read-only verification does not require a wallet.

The browser libraries and certificate artwork are included in `frontend/vendor/` and `frontend/templates/`. There is no frontend build step. Dependency installation and the first Solidity compiler download require internet access.

## Quick start

Run commands from the project root after cloning or downloading this repository.

### 1. Install dependencies

```sh
npm ci
```

### 2. Configure the local environment

In PowerShell:

```powershell
Copy-Item .env.example .env
```

In Bash:

```sh
cp .env.example .env
```

The example uses `http://127.0.0.1:8545`. Leave `PRIVATE_KEY` empty to use Ganache's unlocked accounts, or set it to a funded Ganache test account key. Never use a real wallet key for this demo.

### 3. Start Ganache

In a separate terminal:

```sh
npx ganache@7 --server.host 127.0.0.1 --server.port 8545 --chain.chainId 1337
```

Keep the process running. Use one of its funded test accounts for deployment and import that same account into MetaMask. These options follow the [Ganache CLI reference](https://archive.trufflesuite.com/docs/ganache/reference/cli-options/).

### 4. Initialize and deploy

```sh
node scripts/init-data.js
npm run verify
npm run compile
npm run deploy
```

Deployment creates `deployments/CertificateRegistry-ganache.json`. The server and frontend use that record to locate your contract. The deployer becomes the authorized issuer.

### 5. Start the application

```sh
npm run dev
```

Open http://localhost:8080. Configure MetaMask with RPC URL `http://127.0.0.1:8545`, chain ID `1337`, and currency symbol `ETH`. Connect the account that deployed the contract.

- Issuer dashboard: http://localhost:8080/issuer.html
- Verification page: http://localhost:8080/verifier.html

Serve the app through this command; opening the HTML files directly does not provide the storage API. `frontend/config.js` controls browser RPC settings; React-style environment variables are not used.

## How verification works

The contract records a certificate hash, issuing address, timestamp, metadata, and revocation status. PDF workflows hash the final PDF bytes and anchor a separate hash of the certificate fields in on-chain metadata. The CLI sample workflow hashes canonical certificate JSON instead.

The Node.js API checks confirmed contract events before saving records or updating revocation status. Full local records live in `data/certificates.json`; some metadata is also written on-chain. Use fictional data for demonstrations.

Certificate-ID lookup needs the local store. A hash can be checked directly against the deployed registry. Editing a registered PDF changes its hash. A QR code pointing to localhost works only on a machine running this application and its matching chain.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run check` | Check application JavaScript syntax, HTML IDs, and local HTML assets without writing generated files |
| `npm run compile` | Compile Solidity; writes `artifacts/` and `cache/` |
| `npm run verify` | Check Ganache connectivity and the configured signer |
| `npm run accounts` | List configured signer addresses on Ganache |
| `npm run deploy` | Deploy a new registry and save its local deployment record |
| `npm run dev` | Start the local application server on port 8080 |
| `npm run dev -- --port 3000` | Start the application on another port |
| `npm run issue` | Issue sample JSON certificates on Ganache |
| `npm run qr` | Generate QR images for stored certificates |
| `npm run templates:preview` | Generate sample PDFs under `docs/template-previews/` |
| `npm test` | Run the local Hardhat test suite, when `test/` is available |
| `npm run test:ganache` | Run the local suite against Ganache, when `test/` is available |
| `npm run clean` | Remove Hardhat compilation outputs |

`test/` is excluded by the current `.gitignore`, so a GitHub checkout does not include the local test suite. A successful syntax check is not an end-to-end test. With local tests available, `npm run check -- --include-tests` includes their syntax checks.

## Repository layout

```text
contracts/                 Solidity certificate registry
frontend/                  Pages, scripts, styles, browser libraries, artwork
scripts/                   Deployment, storage, QR, and validation utilities
hardhat.config.js          Compiler and Ganache configuration
package.json               Commands and dependencies
package-lock.json          Locked dependency versions
.env.example               Safe environment template
Local_Connection.md         Local setup and troubleshooting
Consensus_Model.md          Current trust model and proposed consortium design
```

Dependencies, secrets, runtime certificate data, deployments, build outputs, tests, original design references, and `docs/` are excluded under the current ignore rules. Runtime template artwork is included separately under `frontend/templates/`.

A fresh checkout starts without previous certificates or deployment records. Back up the certificate store, issued PDFs, and matching blockchain state separately if you need to preserve a demo. Restarting Ganache without persistent chain storage removes its contracts and transactions; deploy again and start with matching data rather than assuming old records belong to the new chain.

## Documentation and limits

- [Local connection guide](Local_Connection.md)
- [Consensus model](Consensus_Model.md)
- [Script reference](scripts/README.md)

This is a local development application. GitHub hosts its source; GitHub Pages alone cannot run the Node.js API or Ganache. The server binds to the loopback interface. Public hosting, production authentication, durable shared storage, and consortium governance require additional implementation.

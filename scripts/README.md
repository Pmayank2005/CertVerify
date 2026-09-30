# Script reference

Run commands from the project root. See the [setup guide](../README.md#quick-start) and [connection guide](../Local_Connection.md).

| Script | Command | Behavior |
| --- | --- | --- |
| `check-project.js` | `npm run check` | Check source syntax and local HTML assets; add `-- --include-tests` to include optional local tests |
| `init-data.js` | `node scripts/init-data.js` | Create storage and deployment directories; preserve an existing store |
| `test-connection.js` | `npm run verify` | Check Ganache, chain ID, signer, and balance |
| `deploy.js` | `npm run deploy` | Deploy a registry with the signer as issuer; write a deployment JSON |
| `dev-angular.js` | `npm run dev` | Build/watch Angular and start the local server on port 8080; refresh the browser after rebuilding |
| `serve-frontend.js` | `npm start` | Build production Angular assets and serve them with the local storage API |
| `issue-certificate.js` | `npm run issue` | Issue sample canonical-JSON certificates, or use JSON from the `CERT_DATA` environment variable |
| `generate-qr.js` | `npm run qr` | Generate verification QR images under `data/qr/`; optional `BASE_URL` environment variable |
| `preview-templates.js` | `npm run templates:preview` | Write preview PDFs under `docs/template-previews/` without issuing transactions |

Hardhat scripts read `GANACHE_RPC_URL` and optional `PRIVATE_KEY` from `.env`. The storage API also reads the RPC URL. The QR command reads `BASE_URL` from the process environment, defaulting to `http://localhost:8080`.

The frontend automatically reads the Ganache deployment address from `deployments/CertificateRegistry-ganache.json`. Browser network settings are in `frontend/config.js`; `REACT_APP_*` variables are not used.

The CLI issuance workflow hashes canonical JSON, while browser PDF issuance hashes PDF bytes. Verify using the matching workflow. The `lib/` directory contains hashing, JSON storage, QR, and transaction-validation helpers.

Generated data, deployments, and previews are local files excluded by `.gitignore`. A fresh checkout must initialize and deploy before issuing certificates. The ignored `test/` suite must be available locally to run `npm test`.

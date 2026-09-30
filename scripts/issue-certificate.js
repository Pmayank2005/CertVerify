/**
 * End-to-End Certificate Issuance Pipeline
 *
 * Takes certificate data → hashes it → stores the hash on-chain → saves
 * the full data off-chain.
 *
 * Usage (via Hardhat):
 *   npx hardhat run scripts/issue-certificate.js --network ganache
 *
 * Or with custom certificate data:
 *   CERT_DATA='{"studentName":"Alice","course":"CS101","institution":"Demo University","dateOfCompletion":"2025-06-15"}' \
 *     npx hardhat run scripts/issue-certificate.js --network ganache
 *
 * Or as a module:
 *   const { issueCertificate } = require("./issue-certificate");
 */

const { hashCertificate, canonicalize, verifyHash } = require("./lib/hash");
const store = require("./lib/store");
const fs = require("node:fs");
const path = require("node:path");

// ──────────────────────────────────────────────────────────────────────────────
// Sample certificate data (used when no CERT_DATA env var is provided)
// ──────────────────────────────────────────────────────────────────────────────
const SAMPLE_CERTIFICATES = [
  {
    studentName: "Alice Johnson",
    course: "CS101 — Introduction to Computer Science",
    institution: "Demo University",
    dateOfCompletion: "2025-06-15",
    grade: "A",
    certificateId: "CERT-2025-001",
  },
  {
    studentName: "Bob Smith",
    course: "MATH201 — Linear Algebra",
    institution: "Demo University",
    dateOfCompletion: "2025-07-20",
    grade: "B+",
    certificateId: "CERT-2025-002",
  },
  {
    studentName: "Carol Davis",
    course: "ENG301 — Advanced Technical Writing",
    institution: "Demo University",
    dateOfCompletion: "2025-08-10",
    grade: "A-",
    certificateId: "CERT-2025-003",
  },
];

/**
 * Issues a certificate: hash → on-chain → off-chain.
 *
 * @param {Object} contract - ethers.js contract instance (CertificateRegistry)
 * @param {Object} certData - Certificate data fields
 * @returns {Object} { hash, txHash, blockNumber, record }
 */
async function issueCertificate(contract, certData) {
  // 1. Hash the certificate data
  const hash = hashCertificate(certData);
  const canonical = canonicalize(certData);

  console.log(`\n  📋 Certificate data (canonical):`);
  console.log(`     ${canonical}`);
  console.log(`  🔑 SHA-256 Hash: ${hash}`);

  // 2. Verify determinism: re-hash should match
  const verification = verifyHash(hash, certData);
  if (!verification) {
    throw new Error("FATAL: Hash verification failed — non-deterministic hashing detected!");
  }
  console.log(`  ✓  Determinism check passed`);

  // 3. Check if certificate already exists on-chain
  const existingStatus = await contract.getCertificateStatus(hash);
  if (existingStatus !== 0) {
    console.log(`  ⚠️  Certificate with this hash already exists on-chain (status: ${existingStatus})`);
    return null;
  }

  // 4. Store hash on-chain
  const metadataJson = JSON.stringify({
    studentName: certData.studentName,
    course: certData.course,
    institution: certData.institution,
    dateOfCompletion: certData.dateOfCompletion,
  });

  console.log(`  ⛓️  Sending transaction to blockchain...`);
  const tx = await contract.issueCertificate(hash, metadataJson);
  const receipt = await tx.wait();

  console.log(`  ✓  On-chain: TX ${receipt.transactionHash} (block #${receipt.blockNumber})`);

  // 5. Store full data off-chain
  const record = store.save(hash, certData, {
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    contractAddress: contract.address,
  });

  console.log(`  ✓  Off-chain: saved to data/certificates.json`);

  return {
    hash,
    txHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    record,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// CLI entry point (when run via `npx hardhat run`)
// ──────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Certificate Issuance Pipeline ===\n");

  // Load contract
  const deploymentPath = path.join(__dirname, "..", "deployments", "CertificateRegistry-ganache.json");
  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ No deployment found. Run `npm run deploy` first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  console.log(`Contract: ${deployment.contractAddress}`);
  console.log(`Network:  ${deployment.network}\n`);

  const CertificateRegistry = await ethers.getContractFactory("CertificateRegistry");
  const contract = CertificateRegistry.attach(deployment.contractAddress);

  // Determine which certificates to issue
  let certificates;

  if (process.env.CERT_DATA) {
    // Single certificate from environment variable
    try {
      certificates = [JSON.parse(process.env.CERT_DATA)];
    } catch (err) {
      console.error("❌ Invalid CERT_DATA JSON:", err.message);
      process.exit(1);
    }
  } else {
    // Default: issue all sample certificates
    certificates = SAMPLE_CERTIFICATES;
    console.log(`Issuing ${certificates.length} sample certificates...\n`);
  }

  // Issue each certificate
  const results = [];
  for (let i = 0; i < certificates.length; i++) {
    const certData = certificates[i];
    console.log(`--- Certificate ${i + 1} of ${certificates.length} ---`);
    console.log(`  Student: ${certData.studentName}`);
    console.log(`  Course:  ${certData.course}`);

    try {
      // Transactions are intentionally sequential so each receipt and nonce is finalized in order.
      const result = await issueCertificate(contract, certData); // NOSONAR
      if (result) {
        results.push(result);
      }
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
    }
  }

  // Summary
  console.log(`\n=== Issuance Summary ===`);
  console.log(`Total issued: ${results.length} / ${certificates.length}`);
  console.log(`Off-chain store: ${store.count()} certificates total`);

  if (results.length > 0) {
    console.log(`\nIssued hashes:`);
    for (const r of results) {
      console.log(`  ${r.hash}`);
    }
  }

  console.log(`\nDone.`);
}

// Run if executed directly via Hardhat
if (require.main === module || typeof hardhatArguments !== "undefined") {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { issueCertificate, SAMPLE_CERTIFICATES };

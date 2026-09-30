/**
 * QR Code Generation CLI Script (Phase 3)
 *
 * Generates QR codes for certificates either from command-line arguments
 * or in batch for all certificates stored in data/certificates.json.
 *
 * Usage:
 *   # Batch generate for all stored certificates:
 *   node scripts/generate-qr.js
 *
 *   # Generate for a single specific hash:
 *   node scripts/generate-qr.js 0x23e1c5dd7dfa29dbe679c372889cc5843a4bcad419504a1d37374fce4e8a2be1
 *
 *   # Custom base URL:
 *   BASE_URL=http://myinstitution.edu node scripts/generate-qr.js
 */

const path = require("path");
const fs = require("fs");
const { generateVerificationUrl, saveQrImage } = require("./lib/qr");
const store = require("./lib/store");

async function main() {
  console.log("=== QR Code Generation Tool ===\n");

  const baseUrl = process.env.BASE_URL || "http://localhost:8080";
  const outputDir = path.join(__dirname, "..", "data", "qr");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Check if a specific hash was provided via CLI argument
  const targetHash = process.argv[2];

  if (targetHash) {
    const cleanHash = targetHash.trim();
    console.log(`Generating QR code for hash: ${cleanHash}`);
    const verifyUrl = generateVerificationUrl(cleanHash, baseUrl);
    console.log(`Verification URL: ${verifyUrl}`);

    const fileName = `${cleanHash.replace(/^0x/i, "").slice(0, 16)}.png`;
    const outputPath = path.join(outputDir, fileName);

    await saveQrImage(verifyUrl, outputPath, { width: 400 });
    console.log(`✓ Saved QR code to: ${outputPath}\n`);
    return;
  }

  // Batch mode: load certificates from store
  const certificates = store.getAll();
  const hashes = Object.keys(certificates);

  if (hashes.length === 0) {
    console.log("No certificates found in data/certificates.json.");
    console.log("Run `npm run issue` first to create sample certificates.\n");
    return;
  }

  console.log(`Found ${hashes.length} certificates in off-chain store.`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Base URL:         ${baseUrl}\n`);

  for (let i = 0; i < hashes.length; i++) {
    const hash = hashes[i];
    const cert = certificates[hash];
    const student = cert.data?.studentName || "Unknown Student";
    const course = cert.data?.course || "Unknown Course";

    const verifyUrl = generateVerificationUrl(hash, baseUrl);
    // Use short hash prefix for readable filename, or full hash
    const fileName = `${hash.toLowerCase()}.png`;
    const outputPath = path.join(outputDir, fileName);

    await saveQrImage(verifyUrl, outputPath, { width: 400 });

    console.log(`[${i + 1}/${hashes.length}] ${student} (${course})`);
    console.log(`    Hash: ${hash}`);
    console.log(`    URL:  ${verifyUrl}`);
    console.log(`    File: data/qr/${fileName}\n`);
  }

  console.log(`✓ All ${hashes.length} QR codes generated successfully in data/qr/`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ QR Generation failed:", err);
    process.exit(1);
  });
}

module.exports = { main };

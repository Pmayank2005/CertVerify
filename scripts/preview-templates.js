// Generate reviewable samples without registering anything on the blockchain.
const fs = require("node:fs/promises");
const path = require("node:path");
const PDFLib = require("pdf-lib");
const QRCode = require("qrcode");
const workflows = require("../frontend/certificate-workflows");

async function main() {
  const output = path.join(__dirname, "../docs/template-previews");
  await fs.mkdir(output, { recursive: true });
  for (const template of workflows.DEFAULT_TEMPLATES) {
    const data = {
      certificateId: "CV-20260929-0000000000",
      certificateTitle: "CERTIFICATE OF ACHIEVEMENT",
      studentName: "Avery Morgan",
      course: "Computer Science",
      institution: "Example University",
      issueDate: "2026-09-29",
      issuerName: "Dr. Taylor",
      grade: "PREVIEW ONLY - NOT ISSUED",
    };
    const verificationUrl = `http://localhost:8080/verifier.html?id=${encodeURIComponent(data.certificateId)}`;
    const qrPngBytes = await QRCode.toBuffer(verificationUrl, { width: 260, margin: 2, errorCorrectionLevel: "M" });
    const bytes = await workflows.generateCertificatePdf(data, { templateId: template.id, PDFLib, qrPngBytes });
    await fs.writeFile(path.join(output, `${template.id}.pdf`), bytes);
    console.log(`${template.name}: ${bytes.length} bytes`);
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });

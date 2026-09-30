/**
 * Public verification page logic (Phase 3)
 *
 * Supports:
 * - Read-only certificate lookup by hash
 * - QR code image scanning (drag & drop, file upload, clipboard paste)
 * - Deep-linking via ?hash=0x... query parameter with auto-verification
 * - Dual verification: on-chain smart contract + off-chain data integrity check
 * - Interactive QR code generation & diploma presentation
 *
 * Loaded by verifier.html after app.js.
 */

const $ = (id) => document.getElementById(id);

async function getVerificationHash(rawInput, resultEl) {
  if (!rawInput) {
    resultEl.className = "result show error";
    resultEl.textContent = "✗ Please enter a certificate hash or scan a QR code.";
    return null;
  }

  try {
    if (/^(0x)?[a-f0-9]{64}$/i.test(rawInput)) return toBytes32(rawInput);
    const records = await fetchOffchainCertificates();
    const match = Object.values(records).find((record) => {
      const certificateId = record.certificateId || record.data?.certificateId;
      return certificateId?.toLowerCase() === rawInput.toLowerCase();
    });
    if (!match) throw new Error("Certificate ID was not found in the registry records.");
    return toBytes32(match.hash);
  } catch (err) {
    resultEl.className = "result show error";
    resultEl.textContent = "✗ " + err.message;
    return null;
  }
}

function inspectOffchainIntegrity(hash, offchainRecord, onchainMetadata = {}) {
  if (!offchainRecord?.data) return { verified: false, tampered: false };
  // Document hashes anchor PDF bytes, not the accompanying JSON metadata.
  if (["pdf", "raw-data"].includes(onchainMetadata.issueMethod || offchainRecord.issueMethod)) {
    let metadataVerified = false;
    if (onchainMetadata.metadataHash) {
      try { metadataVerified = computeCertificateHash(offchainRecord.data).toLowerCase() === onchainMetadata.metadataHash.toLowerCase(); } catch { /* Invalid metadata is unverified. */ }
    }
    return { verified: false, tampered: !!onchainMetadata.metadataHash && !metadataVerified, document: true, metadataVerified };
  }
  try {
    const computedHash = computeCertificateHash(offchainRecord.data);
    const matches = computedHash.toLowerCase() === hash.toLowerCase();
    return { verified: matches, tampered: !matches };
  } catch (err) {
    console.warn("Could not re-hash off-chain data:", err);
    return { verified: false, tampered: false };
  }
}

function renderIntegrityBadge(status, label, integrity) {
  let integrityBadge = "";
  if (integrity.document) {
    const details = integrity.tampered ? "Warning: displayed metadata differs from its on-chain anchor." : integrity.metadataVerified ? "Certificate metadata matches its on-chain anchor." : "Displayed metadata is not independently verified.";
    const documentMessage = integrity.pdfUploaded && status !== 0 ? "Uploaded PDF bytes match the registered hash." : "Upload the original PDF to verify its bytes.";
    integrityBadge = `<div class="integrity-badge${integrity.tampered ? " tampered" : ""}">${documentMessage} ${details}</div>`;
  } else if (integrity.verified) {
    integrityBadge = '<div class="integrity-badge verified">🛡️ Cryptographic Integrity Verified — Data Matches On-Chain Anchor</div>';
  } else if (integrity.tampered) {
    integrityBadge = '<div class="integrity-badge tampered">⚠️ Tampering Detected — Off-Chain Data Differs from On-Chain Hash!</div>';
  } else if (status === 1) {
    integrityBadge = '<div class="integrity-badge" style="background:rgba(99,102,241,0.15); color:#a5b4fc; border:1px solid rgba(99,102,241,0.4);">⛓️ Verified on Blockchain</div>';
  }

  return `<div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
    <div><span class="badge ${label.css}">${label.text}</span>${integrityBadge}</div>
  </div>`;
}

function renderCertificateDiploma(status, displayData, cert, hash, offchainRecord) {
  const hasIdentity = displayData.studentName || displayData.student || displayData.course;
  if (status !== 1 || !hasIdentity) return "";

  const student = displayData.studentName || displayData.student || "Recipient";
  const course = displayData.course || "Certified Program";
  const institution = displayData.institution || "Academic Institution";
  const date = displayData.dateOfCompletion || displayData.issuedOn || formatTimestamp(cert.issuedAt);
  const grade = displayData.grade || "Passing";
  const certId = displayData.certificateId || shorten(hash, 8, 6);

  return `<div class="diploma-card">
    <div class="diploma-header">
      <div class="diploma-institution">🏛️ ${escapeHtml(institution)}</div>
      <div class="diploma-cert-type">Certificate of Academic Completion</div>
    </div>
    <div class="diploma-body">
      <div class="certifies-text">This certifies that</div>
      <div class="diploma-student-name">${escapeHtml(student)}</div>
      <div class="completion-text">has successfully fulfilled all requirements for</div>
      <div class="diploma-course-name">${escapeHtml(course)}</div>
    </div>
    <div class="diploma-grid">
      <div class="diploma-grid-item"><label>Completion Date</label><value>${escapeHtml(date)}</value></div>
      <div class="diploma-grid-item"><label>Evaluation Grade</label><value>${escapeHtml(grade)}</value></div>
      <div class="diploma-grid-item"><label>Certificate ID</label><value class="mono" style="font-size:0.8rem;">${escapeHtml(certId)}</value></div>
      <div class="diploma-grid-item"><label>Issuing Authority</label><value class="mono" style="font-size:0.75rem;">${shorten(cert.issuedBy, 6, 4)}</value></div>
    </div>
    <div class="diploma-footer">
      <span>Anchored on Ganache Blockchain • Block #${offchainRecord?.onChain?.blockNumber || "—"}</span>
      <span>SHA-256 Digest: ${shorten(hash, 8, 6)}</span>
    </div>
  </div>`;
}

function buildVerificationMarkup(status, label, cert, hash, offchainRecord, displayData, integrity) {
  const issuerAddress = cert.issuedBy === ethers.constants.AddressZero ? "—" : cert.issuedBy;
  const transactionRow = offchainRecord?.onChain?.txHash
    ? `<tr><td>Transaction</td><td><span class="mono">${shorten(offchainRecord.onChain.txHash, 14, 10)}</span></td></tr>`
    : "";

  return `${renderIntegrityBadge(status, label, integrity)}
    ${renderCertificateDiploma(status, displayData, cert, hash, offchainRecord)}
    <h3 style="margin-top:20px; font-size:0.95rem; color:#c7d2fe;">Blockchain Registry Record</h3>
    <table class="kv">
      <tr><td>SHA-256 Hash</td><td><span class="mono">${hash}</span></td></tr>
      <tr><td>Issuer Address</td><td>${issuerAddress}</td></tr>
      <tr><td>Timestamp</td><td>${formatTimestamp(cert.issuedAt)}</td></tr>
      <tr><td>Status Code</td><td>${status} (${label.text})</td></tr>
      ${transactionRow}
    </table>
    <div class="qr-box">
      <div style="font-size:0.9rem; font-weight:600; color:var(--text);">Certificate QR Code</div>
      <div class="qr-canvas-frame"><canvas id="verifiedQrCanvas"></canvas></div>
      <div class="qr-actions">
        <button id="downloadQrBtn" class="btn secondary" style="padding:6px 14px; font-size:0.82rem;">⬇️ Download QR (PNG)</button>
        <button id="copyVerifyLinkBtn" class="btn secondary" style="padding:6px 14px; font-size:0.82rem;">📋 Copy Verification Link</button>
      </div>
    </div>`;
}

async function setupVerificationQr(hash) {
  const canvas = $("verifiedQrCanvas");
  const verifyUrl = getVerificationUrl(hash);
  if (canvas) await renderQrCode(canvas, verifyUrl, { width: 180, margin: 2 });

  $("downloadQrBtn")?.addEventListener("click", () => {
    if (!canvas) return;
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = `certificate-${shorten(hash, 6, 6)}.png`;
    anchor.click();
  });

  $("copyVerifyLinkBtn")?.addEventListener("click", async (event) => {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      event.target.textContent = "✓ Link Copied!";
      setTimeout(() => { event.target.textContent = "📋 Copy Verification Link"; }, 2000);
    } catch (err) {
      // Clipboard permission may be unavailable; keep the verification URL accessible.
      console.warn("[verifier] Could not copy verification link:", err);
      showBanner("Could not copy the link. Verification URL: " + verifyUrl);
    }
  });
}

async function verifyCertificate(hashToVerify, pdfUploaded = false) {
  const resultEl = $("verifyResult");
  const btn = $("verifyBtn");
  const placeholder = $("verifyPlaceholder");
  hideBanner();
  resultEl.className = "result";
  if (placeholder) placeholder.style.display = "none";

  const hash = await getVerificationHash(hashToVerify || $("verifyHash").value.trim(), resultEl);
  if (!hash) return;
  $("verifyHash").value = hash;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Verifying on blockchain…';

  try {
    const contract = state.contract || createReadonlyContract();
    const [statusNum, cert, offchainRecord] = await Promise.all([
      contract.getCertificateStatus(hash),
      contract.getCertificate(hash),
      fetchOffchainCertificate(hash),
    ]);
    const status = Number(statusNum);
    const label = statusLabel(status);
    const integrity = inspectOffchainIntegrity(hash, offchainRecord, parseMetadata(cert.metadata));
    integrity.pdfUploaded = pdfUploaded;
    const displayData = offchainRecord?.data || parseMetadata(cert.metadata);

    resultEl.className = "result show";
    resultEl.innerHTML = buildVerificationMarkup(
      status, label, cert, hash, offchainRecord, displayData, integrity
    );
    await setupVerificationQr(hash);
  } catch (err) {
    resultEl.className = "result show error";
    resultEl.textContent = "✗ " + errorMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Verify Certificate";
  }
}

async function verifyUploadedPdf(file) {
  const status = $("pdfVerificationStatus");
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    CertificateWorkflows.validatePdfFile(file, bytes);
    const hash = await CertificateWorkflows.hashPdfBytes(bytes);
    status.textContent = `Local PDF SHA-256: ${hash}. Checking blockchain registration…`;
    $("verifyHash").value = hash;
    await verifyCertificate(hash, true);
  } catch (err) {
    status.textContent = errorMessage(err);
  }
}

/** Handles reading an image file and extracting the QR code. */
async function handleQrImageFile(file) {
  if (!file?.type?.startsWith("image/")) {
    alert("Please select a valid image file.");
    return;
  }

  const dropzone = $("qrDropzone");
  const origText = dropzone.innerHTML;
  dropzone.innerHTML = '<span class="spinner"></span> Scanning QR code from image…';

  try {
    const decodedText = await decodeQrFromImage(file);
    const extractedHash = extractHashFromQr(decodedText);

    if (!extractedHash) {
      throw new Error("Could not find a valid certificate hash in the decoded QR code.");
    }

    dropzone.innerHTML = `<span style="color:var(--success);">✓ QR Code Scanned Successfully</span>`;
    setTimeout(() => { dropzone.innerHTML = origText; }, 2500);

    $("verifyHash").value = extractedHash;
    await verifyCertificate(extractedHash);
  } catch (err) {
    dropzone.innerHTML = `<span style="color:var(--danger);">✗ ${escapeHtml(err.message)}</span>`;
    setTimeout(() => { dropzone.innerHTML = origText; }, 3500);
  }
}

/** Setup QR Dropzone drag-and-drop & file picker */
function setupQrScanner() {
  const dropzone = $("qrDropzone");
  const fileInput = $("qrFileInput");
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleQrImageFile(selectedFile);
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleQrImageFile(droppedFile);
    }
  });

  // Support paste from clipboard (Ctrl+V)
  window.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) handleQrImageFile(file);
      break;
    }
  });
}

/** Clears the input and result. */
function clearForm() {
  $("verifyHash").value = "";
  $("verifyResult").className = "result";
  const placeholder = $("verifyPlaceholder");
  if (placeholder) placeholder.style.display = "";
  hideBanner();
}

/** Hook for account changes. */
function onAccountChanged() {
  updateTopbar();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

window.addEventListener("DOMContentLoaded", async () => {
  await CONFIG.loadDeployment();
  await initWalletSession();
  setupTopbar();
  setupQrScanner();
  createReadonlyContract();
  $("verifyPdfInput").addEventListener("change", (event) => {
    verifyUploadedPdf(event.target.files?.[0]);
  });

  $("verifyBtn").addEventListener("click", () => verifyCertificate());
  $("clearBtn").addEventListener("click", clearForm);
  $("verifyHash").addEventListener("keydown", (e) => {
    if (e.key === "Enter") verifyCertificate();
  });

  // Check URL query parameters for auto-verification (?hash=0x...)
  const params = new URLSearchParams(window.location.search);
  const lookupParam = params.get("hash") || params.get("id");
  if (lookupParam) {
    $("verifyHash").value = lookupParam.trim();
    await verifyCertificate(lookupParam.trim());
  }
});

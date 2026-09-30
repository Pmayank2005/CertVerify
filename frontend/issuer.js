/** Route-scoped certificate workflows used by the Angular issuer component. */
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.codePointAt(0));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected template image."));
    reader.readAsDataURL(file);
  });
}

function offchainRecordForHash(records, hash) {
  return Object.entries(records).find(([key]) => key.toLowerCase() === hash.toLowerCase())?.[1] || null;
}

function managementStatus(status) {
  if (status === "valid") return { text: "Valid", css: "status-valid" };
  if (status === "revoked") return { text: "Revoked", css: "status-revoked" };
  return { text: "Unregistered", css: "status-notfound" };
}

function managementIssueDate(value, fallback) {
  const dateValue = value || fallback;
  if (!dateValue) return "—";
  const numericValue = Number(dateValue);
  if (Number.isFinite(numericValue) && numericValue > 0) return new Date(numericValue * 1000).toLocaleString();
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function createIssuerController(client, scope, libraries) {
const { state, CONFIG, createReadonlyContract, toBytes32, shorten, errorMessage, parseMetadata, escapeHtml, showBanner, hideBanner, updateTopbar, computeCertificateHash, getVerificationUrl, getCertificateVerificationUrl, renderQrCode, fetchOffchainCertificates, storeCertificateOffchain, updateCertificateStatusOffchain } = client;
const ensureCorrectNetwork = async () => { scope.assertActive(); await client.ensureCorrectNetwork(); scope.assertActive(); };
const { ethers, CertificateWorkflows, PDFLib, JSZip } = libraries;
/**
 * Issuer dashboard logic — issue / revoke certificates and show contract state.
 * Instantiated by CertificateWorkflowService after Angular renders the page.
 */

const $ = scope.get;
let pendingPdfIssue = null;
let pdfPreviewUrl = null;
let pendingRawIssue = null;
let rawPreviewUrl = null;
let bulkCsvRecords = [];
let bulkValidatedRows = [];
let bulkGeneratedCertificates = [];
let bulkGenerationRevision = 0;
let bulkPreviewUrl = null;
let issuedCertificateRecords = [];
let selectedCertificateRecord = null;
let pendingRevocationRecord = null;
let certificateStatusFilter = "all";
const activePdfDocuments = new Map();
const CUSTOM_TEMPLATE_STORAGE_KEY = "certverify.customTemplates.v1";
let savedCustomTemplates = [];

const BULK_MAPPING_FIELDS = [
  { key: "studentName", label: "Student name", required: true },
  { key: "course", label: "Course", required: true },
  { key: "institution", label: "Institution", required: true },
  { key: "issueDate", label: "Issue / completion date", required: true },
  { key: "grade", label: "Grade", required: false },
];

// ---------------------------------------------------------------------------
// Page-specific state refresh
// ---------------------------------------------------------------------------

/** Loads contract info and highlights whether the user is the issuer. */
async function onWalletConnected() {
  hideBanner();
  await Promise.all([loadContractInfo(), loadIssuerInfo()]);
}

/** Hook used when the user switches accounts in MetaMask. */
async function onAccountChanged() {
  updateTopbar();
  await onWalletConnected();
}

async function loadContractInfo() {
  const contract = state.signerContract || createReadonlyContract();

  $("contractAddress").textContent = CONFIG.CONTRACT_ADDRESS;

  try {
    const total = await contract.getTotalIssuedCount();
    $("totalCount").textContent = total.toString();
  } catch (err) {
    $("totalCount").textContent = "unavailable";
    console.warn("[issuer] getTotalIssuedCount failed:", errorMessage(err));
  }
}

async function loadIssuerInfo() {
  const issuerEl = $("issuerAddress");
  const roleEl = $("roleBadge");

  try {
    const contract = state.signerContract || createReadonlyContract();
    const issuer = await contract.issuer();
    issuerEl.textContent = issuer;

    if (state.account && state.account.toLowerCase() === issuer.toLowerCase()) {
      roleEl.innerHTML = '<span class="badge status-valid">Authorized Issuer ✓</span>';
    } else if (state.account) {
      roleEl.innerHTML = '<span class="badge status-notfound">Not the issuer — txs will fail</span>';
    } else {
      roleEl.textContent = "connect wallet";
    }
  } catch (err) {
    issuerEl.textContent = "unavailable";
    console.warn("[issuer] Could not load issuer:", errorMessage(err));
  }
}

// ---------------------------------------------------------------------------
// Issue certificate
// ---------------------------------------------------------------------------

function pdfIssueData() {
  return {
    studentName: $("pdfStudentName").value.trim(),
    course: $("pdfCourse").value.trim(),
    institution: $("pdfInstitution").value.trim(),
    dateOfCompletion: $("pdfIssueDate").value,
    issueDate: $("pdfIssueDate").value,
    issuerName: $("pdfIssuerName").value.trim(),
    grade: $("pdfGrade").value.trim(),
  };
}

function setPdfReviewMessage(message, isError = false) {
  const result = $("pdfIssueResult");
  result.className = isError ? "result show error" : "result show";
  result.textContent = message;
}

async function preparePdfReview() {
  const file = $("pdfFileInput").files?.[0];
  if (!file) {
    setPdfReviewMessage("Choose a PDF before continuing.", true);
    return;
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    CertificateWorkflows.validatePdfFile(file, bytes);
    const data = pdfIssueData();
    for (const field of CertificateWorkflows.REQUIRED_CERTIFICATE_FIELDS) {
      if (!data[field]) throw new Error(`Enter ${field === "issueDate" ? "an issue date" : field}.`);
    }

    const hash = await CertificateWorkflows.hashPdfBytes(bytes);
    const contract = state.contract || createReadonlyContract();
    const [chainStatus, records] = await Promise.all([
      contract.getCertificateStatus(hash),
      fetchOffchainCertificates(),
    ]);
    CertificateWorkflows.assertUniqueCertificateHash(hash, chainStatus, records);

    const certificateId = CertificateWorkflows.createCertificateId();
    data.certificateId = certificateId;
    if ($("pdfFileInput").files?.[0] !== file || JSON.stringify({ ...pdfIssueData(), certificateId }) !== JSON.stringify(data)) {
      throw new Error("PDF details changed during review. Review the PDF again.");
    }
    pendingPdfIssue = { file, bytes, hash, certificateId, data };
    $("pdfReviewSummary").innerHTML = `
      <table class="kv">
        <tr><td>File</td><td>${escapeHtml(file.name)}</td></tr>
        <tr><td>Size</td><td>${(file.size / 1024).toFixed(1)} KB</td></tr>
        <tr><td>SHA-256 of PDF bytes</td><td><span class="mono">${hash}</span></td></tr>
        <tr><td>Certificate ID</td><td><span class="mono">${certificateId}</span></td></tr>
        <tr><td>Recipient</td><td>${escapeHtml(data.studentName)}</td></tr>
        <tr><td>Course</td><td>${escapeHtml(data.course)}</td></tr>
        <tr><td>Institution</td><td>${escapeHtml(data.institution)}</td></tr>
      </table>`;
    $("confirmPdfIssue").checked = false;
    $("issuePdfBtn").disabled = true;
    $("pdfReview").hidden = false;
    $("pdfIssueResult").className = "result";
  } catch (err) {
    pendingPdfIssue = null;
    $("pdfReview").hidden = true;
    setPdfReviewMessage(errorMessage(err), true);
  }
}

async function issueUploadedPdf() {
  const pending = pendingPdfIssue;
  if (!pending) {
    setPdfReviewMessage("Review the PDF before issuing it.", true);
    return;
  }
  if (!$("confirmPdfIssue").checked) {
    setPdfReviewMessage("Confirm the PDF and metadata before submitting the transaction.", true);
    return;
  }
  if (!state.signerContract || !state.account) {
    showBanner("Connect the authorized issuer wallet before issuing.");
    return;
  }

  const button = $("issuePdfBtn");
  button.disabled = true;
  button.textContent = "Confirm in MetaMask…";
  $("pdfIssueResult").className = "result";
  try {
    await ensureCorrectNetwork();
    const authorizedIssuer = await state.signerContract.issuer();
    if (authorizedIssuer.toLowerCase() !== state.account.toLowerCase()) {
      throw new Error("The connected wallet is not authorized to issue certificates.");
    }

    const contractMetadata = JSON.stringify({
      certificateId: pending.certificateId,
      issueMethod: "pdf",
      documentHash: pending.hash,
      metadataHash: computeCertificateHash(pending.data),
    });
    scope.assertActive();
    const tx = await state.signerContract.issueCertificate(pending.hash, contractMetadata);
    setPdfReviewMessage(`Transaction ${shorten(tx.hash, 10, 8)} submitted. Waiting for blockchain confirmation…`);
    const receipt = await tx.wait();
    pendingPdfIssue = null;
    $("confirmPdfIssue").checked = false;
    const verifyUrl = getCertificateVerificationUrl(pending.certificateId);
    activePdfDocuments.set(pending.certificateId, pending.file);
    const storedRecord = await storeCertificateOffchain(pending.hash, pending.data, {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      contractAddress: CONFIG.CONTRACT_ADDRESS,
      issuerAddress: receipt.from,
    }, {
      certificateId: pending.certificateId,
      issueMethod: "pdf",
      documentHash: pending.hash,
      documentName: pending.file.name,
      issuerAddress: receipt.from,
    });

    const result = $("pdfIssueResult");
    result.className = "result show";
    result.innerHTML = `
      <span class="badge status-valid">Certificate issued</span>
      <table class="kv">
        <tr><td>Certificate ID</td><td><span class="mono">${pending.certificateId}</span></td></tr>
        <tr><td>PDF SHA-256</td><td><span class="mono">${pending.hash}</span></td></tr>
        <tr><td>Transaction</td><td><span class="mono">${shorten(receipt.transactionHash, 14, 10)}</span></td></tr>
        <tr><td>Block</td><td>${receipt.blockNumber}</td></tr>
        <tr><td>Blockchain status</td><td>Registered · valid</td></tr>
        <tr><td>Off-chain metadata</td><td>${storedRecord ? "Saved" : "Not saved; transaction is confirmed"}</td></tr>
      </table>
      <div class="qr-box">
        <div class="qr-canvas-frame"><canvas id="pdfIssueQr"></canvas></div>
        <div class="qr-actions">
          <button id="downloadIssuedPdf" class="btn secondary" type="button">Download PDF</button>
          <button id="downloadPdfQr" class="btn secondary" type="button">Download QR (PNG)</button>
        </div>
        <a class="verification-link" href="${escapeHtml(verifyUrl)}">${escapeHtml(verifyUrl)}</a>
      </div>`;

    try {
      const canvas = $("pdfIssueQr");
      await renderQrCode(canvas, verifyUrl, { width: 220, margin: 2 });
      $("downloadPdfQr").addEventListener("click", () => {
        const anchor = document.createElement("a");
        anchor.href = canvas.toDataURL("image/png");
        anchor.download = `${pending.certificateId}-qr.png`;
        anchor.click();
      });
      $("downloadIssuedPdf").addEventListener("click", () => {
        const anchor = document.createElement("a");
        anchor.href = scope.createObjectURL(pending.file);
        anchor.download = pending.file.name;
        anchor.click();
      });
    } catch (err) {
      console.warn("[issuer] Could not render issuance QR:", err);
    }
    await loadContractInfo();
    await loadIssuedCertificates();
  } catch (err) {
    const message = err.code === 4001 || err.code === "ACTION_REJECTED"
      ? "Transaction rejected in MetaMask. No certificate was issued."
      : errorMessage(err);
    setPdfReviewMessage(message, true);
  } finally {
    button.disabled = !$("confirmPdfIssue").checked;
    button.textContent = "Issue certificate";
  }
}

function setupPdfIssuance() {
  $("pdfIssueDate").value = new Date().toISOString().slice(0, 10);
  for (const fieldId of ["pdfStudentName", "pdfCourse", "pdfInstitution", "pdfIssueDate", "pdfIssuerName", "pdfGrade"]) {
    $(fieldId).addEventListener("input", () => {
      if (!pendingPdfIssue) return;
      pendingPdfIssue = null;
      $("pdfReview").hidden = true;
      $("pdfIssueResult").className = "result";
    });
  }
  $("pdfFileInput").addEventListener("change", async (event) => {
    pendingPdfIssue = null;
    $("pdfReview").hidden = true;
    $("preparePdfReviewBtn").disabled = true;
    $("pdfIssueResult").className = "result";
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      CertificateWorkflows.validatePdfFile(file, new Uint8Array(await file.slice(0, 5).arrayBuffer()));
      if (pdfPreviewUrl) scope.revokeObjectURL(pdfPreviewUrl);
      pdfPreviewUrl = scope.createObjectURL(file);
      $("pdfPreview").src = pdfPreviewUrl;
      $("pdfPreview").hidden = false;
      $("pdfFileDetails").textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB · PDF`;
      $("preparePdfReviewBtn").disabled = false;
    } catch (err) {
      $("pdfPreview").hidden = true;
      $("pdfFileDetails").textContent = errorMessage(err);
      setPdfReviewMessage(errorMessage(err), true);
    }
  });
  $("confirmPdfIssue").addEventListener("change", (event) => {
    $("issuePdfBtn").disabled = !event.target.checked;
  });
}

function rawCertificateData() {
  return {
    studentName: $("rawStudentName").value.trim(),
    course: $("rawCourse").value.trim(),
    institution: $("rawInstitution").value.trim(),
    issueDate: $("rawIssueDate").value,
    dateOfCompletion: $("rawIssueDate").value,
    issuerName: $("rawIssuerName").value.trim(),
    grade: $("rawGrade").value.trim(),
    certificateTitle: $("rawCertificateTitle").value.trim() || "Certificate of Completion",
  };
}

async function createQrAsset(verificationUrl) {
  const canvas = document.createElement("canvas");
  await renderQrCode(canvas, verificationUrl, { width: 260, margin: 2 });
  const dataUrl = canvas.toDataURL("image/png");
  return { dataUrl, bytes: dataUrlToBytes(dataUrl) };
}

function loadSavedCustomTemplates() {
  try {
    // Migrate browser-local templates created before the product rename.
    const saved = JSON.parse(localStorage.getItem(CUSTOM_TEMPLATE_STORAGE_KEY) || localStorage.getItem("certchain.customTemplates.v1") || "[]");
    savedCustomTemplates = Array.isArray(saved) ? saved.filter((template) => template.id && template.fields && template.imageDataUrl) : [];
  } catch (err) {
    savedCustomTemplates = [];
    console.warn("[issuer] Saved templates could not be loaded:", err);
  }
}

function updateTemplateSelectors(selectedTemplateId) {
  const templates = [...CertificateWorkflows.DEFAULT_TEMPLATES, ...savedCustomTemplates];
  const optionMarkup = templates.map((template) =>
    `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`
  ).join("");
  for (const selectId of ["rawTemplateId", "bulkTemplateId"]) {
    const select = $(selectId);
    const priorValue = selectedTemplateId || select.value;
    select.innerHTML = optionMarkup;
    if (templates.some((template) => template.id === priorValue)) select.value = priorValue;
  }
  renderTemplateGallery();
}

function renderTemplateGallery() {
  const gallery = $("defaultTemplateGallery");
  if (!gallery) return;
  gallery.innerHTML = CertificateWorkflows.DEFAULT_TEMPLATES.map((template) =>
    `<button type="button" class="template-card" data-template-id="${template.id}" aria-pressed="${$("rawTemplateId").value === template.id}"><img src="${template.backgroundUrl}" alt="${escapeHtml(template.name)} sample artwork" loading="lazy" /><span>${escapeHtml(template.name)}</span></button>`
  ).join("");
}

function getTemplateGenerationOptions(templateId) {
  const customTemplate = savedCustomTemplates.find((template) => template.id === templateId);
  if (!customTemplate) return { templateId };
  return {
    templateId,
    template: customTemplate,
    backgroundBytes: dataUrlToBytes(customTemplate.imageDataUrl),
    backgroundMime: customTemplate.imageMime,
    backgroundOpacity: customTemplate.backgroundOpacity ?? 0.82,
  };
}

function setDesignerControlsFromTemplate(template) {
  const getField = (key) => template.fields.find((field) => field.key === key);
  const student = getField("studentName");
  const course = getField("course");
  const certificateId = getField("certificateId");
  $("templateStudentX").value = Math.round((student?.x ?? 0.5) * 100);
  $("templateStudentY").value = Math.round((student?.y ?? 0.53) * 100);
  $("templateStudentFont").value = student?.size ?? 30;
  $("templateCourseY").value = Math.round((course?.y ?? 0.4) * 100);
  $("templateIdX").value = Math.round((certificateId?.x ?? 0.82) * 100);
  $("templateIdY").value = Math.round((certificateId?.y ?? 0.18) * 100);
  $("templateQrX").value = Math.round((template.qr?.x ?? 0.84) * 100);
  $("templateQrY").value = Math.round((template.qr?.y ?? 0.045) * 100);
  $("templateBackgroundOpacity").value = Math.round((template.backgroundOpacity ?? 0.82) * 100);
  $("templateSignatureEnabled").checked = !!template.signature;
}

async function saveCustomTemplate() {
  const status = $("templateDesignerStatus");
  try {
    const imageFile = $("templateBackgroundInput").files?.[0];
    const name = $("customTemplateName").value.trim();
    if (!name) throw new Error("Enter a name for the custom template.");
    if (!imageFile || !["image/png", "image/jpeg"].includes(imageFile.type)) {
      throw new Error("Choose a PNG or JPG background image.");
    }
    if (imageFile.size > 350 * 1024) throw new Error("Template images must be 350 KB or smaller for browser storage.");
    if (savedCustomTemplates.length >= 3) throw new Error("Remove a saved template before adding another (maximum 3).");
    if (savedCustomTemplates.some((template) => template.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("A saved template already uses this name.");
    }

    const selectedTemplate = CertificateWorkflows.resolveTemplate("certverify-emerald");
    const template = structuredClone(selectedTemplate);
    template.id = `custom-${CertificateWorkflows.createCertificateId()}`;
    template.name = name;
    template.imageDataUrl = await readFileAsDataUrl(imageFile);
    template.imageMime = imageFile.type;
    template.backgroundOpacity = Number($("templateBackgroundOpacity").value) / 100;
    template.frame = false;
    const updatePosition = (key, values) => {
      const field = template.fields.find((candidate) => candidate.key === key);
      if (field) Object.assign(field, values);
    };
    updatePosition("studentName", {
      x: Number($("templateStudentX").value) / 100,
      y: Number($("templateStudentY").value) / 100,
      size: Number($("templateStudentFont").value),
    });
    updatePosition("course", { y: Number($("templateCourseY").value) / 100 });
    updatePosition("certificateId", {
      x: Number($("templateIdX").value) / 100,
      y: Number($("templateIdY").value) / 100,
    });
    template.qr = {
      ...template.qr,
      x: Number($("templateQrX").value) / 100,
      y: Number($("templateQrY").value) / 100,
    };
    if (!$("templateSignatureEnabled").checked) template.signature = null;

    const nextTemplates = [...savedCustomTemplates, template];
    localStorage.setItem(CUSTOM_TEMPLATE_STORAGE_KEY, JSON.stringify(nextTemplates));
    savedCustomTemplates = nextTemplates;
    updateTemplateSelectors(template.id);
    setDesignerControlsFromTemplate(template);
    pendingRawIssue = null;
    $("rawReview").hidden = true;
    $("rawCertificatePreview").hidden = true;
    invalidateBulkGeneration();
    status.textContent = `Saved ${name}. It is available for single and bulk issuance on this browser.`;
  } catch (err) {
    status.textContent = errorMessage(err);
  }
}

async function generateRawPreview() {
  const button = $("generateRawPreviewBtn");
  if (button.disabled) return;
  button.disabled = true;
  pendingRawIssue = null;
  $("rawReview").hidden = true;
  const result = $("rawIssueResult");
  result.className = "result";
  try {
    const data = rawCertificateData();
    for (const field of CertificateWorkflows.REQUIRED_CERTIFICATE_FIELDS) {
      if (!data[field]) throw new Error(`Enter ${field === "issueDate" ? "an issue date" : field}.`);
    }
    const certificateId = CertificateWorkflows.createCertificateId();
    data.certificateId = certificateId;
    const templateId = $("rawTemplateId").value;
    const templateOptions = getTemplateGenerationOptions(templateId);
    const verificationUrl = getCertificateVerificationUrl(certificateId);
    const qr = await createQrAsset(verificationUrl);
    const pdfBytes = await CertificateWorkflows.generateCertificatePdf(data, {
      ...templateOptions,
      qrPngBytes: qr.bytes,
      verificationUrl,
      PDFLib,
    });
    const documentHash = await CertificateWorkflows.hashPdfBytes(pdfBytes);
    const contract = state.contract || createReadonlyContract();
    const [chainStatus, records] = await Promise.all([
      contract.getCertificateStatus(documentHash),
      fetchOffchainCertificates(),
    ]);
    CertificateWorkflows.assertUniqueCertificateHash(documentHash, chainStatus, records);

    if (JSON.stringify({ ...rawCertificateData(), certificateId }) !== JSON.stringify(data) || $("rawTemplateId").value !== templateId) {
      throw new Error("Certificate details changed during generation. Generate the preview again.");
    }
    pendingRawIssue = { data, certificateId, templateId, verificationUrl, qr, pdfBytes, documentHash,
      generation: { verificationUrl, template: templateOptions.template || null } };
    if (rawPreviewUrl) scope.revokeObjectURL(rawPreviewUrl);
    rawPreviewUrl = scope.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
    $("rawCertificatePreview").src = rawPreviewUrl;
    $("rawCertificatePreview").hidden = false;
    $("rawReviewSummary").innerHTML = `
      <table class="kv">
        <tr><td>Certificate ID</td><td><span class="mono">${certificateId}</span></td></tr>
        <tr><td>Template</td><td>${escapeHtml(CertificateWorkflows.resolveTemplate(templateId, savedCustomTemplates).name)}</td></tr>
        <tr><td>Recipient</td><td>${escapeHtml(data.studentName)}</td></tr>
        <tr><td>Course</td><td>${escapeHtml(data.course)}</td></tr>
        <tr><td>Institution</td><td>${escapeHtml(data.institution)}</td></tr>
        <tr><td>Final PDF SHA-256 (includes QR)</td><td><span class="mono">${documentHash}</span></td></tr>
      </table>`;
    $("confirmRawIssue").checked = false;
    $("issueRawBtn").disabled = true;
    $("rawReview").hidden = false;
  } catch (err) {
    pendingRawIssue = null;
    $("rawReview").hidden = true;
    result.className = "result show error";
    result.textContent = errorMessage(err);
  } finally {
    button.disabled = false;
  }
}

async function issueGeneratedCertificate() {
  const pending = pendingRawIssue;
  if (!pending) {
    $("rawIssueResult").textContent = "Generate and review a certificate before issuing it.";
    $("rawIssueResult").className = "result show error";
    return;
  }
  if (!$("confirmRawIssue").checked) {
    $("rawIssueResult").textContent = "Confirm the final PDF before submitting the transaction.";
    $("rawIssueResult").className = "result show error";
    return;
  }
  if (!state.signerContract || !state.account) {
    showBanner("Connect the authorized issuer wallet before issuing.");
    return;
  }

  const button = $("issueRawBtn");
  button.disabled = true;
  button.textContent = "Confirm in MetaMask…";
  try {
    await ensureCorrectNetwork();
    const authorizedIssuer = await state.signerContract.issuer();
    if (authorizedIssuer.toLowerCase() !== state.account.toLowerCase()) {
      throw new Error("The connected wallet is not authorized to issue certificates.");
    }
    const contractMetadata = JSON.stringify({
      certificateId: pending.certificateId,
      issueMethod: "raw-data",
      documentHash: pending.documentHash,
      templateId: pending.templateId,
      metadataHash: computeCertificateHash(pending.data),
    });
    scope.assertActive();
    const tx = await state.signerContract.issueCertificate(pending.documentHash, contractMetadata);
    const result = $("rawIssueResult");
    result.className = "result show";
    result.textContent = `Transaction ${shorten(tx.hash, 10, 8)} submitted. Waiting for confirmation…`;
    const receipt = await tx.wait();
    pendingRawIssue = null;
    $("confirmRawIssue").checked = false;
    const storedRecord = await storeCertificateOffchain(pending.documentHash, pending.data, {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      contractAddress: CONFIG.CONTRACT_ADDRESS,
      issuerAddress: receipt.from,
    }, {
      certificateId: pending.certificateId,
      issueMethod: "raw-data",
      documentHash: pending.documentHash,
      templateId: pending.templateId,
      issuerAddress: receipt.from,
      generation: pending.generation,
    });

    const pdfBlobUrl = scope.createObjectURL(new Blob([pending.pdfBytes], { type: "application/pdf" }));
    result.innerHTML = `
      <span class="badge status-valid">Certificate issued</span>
      <table class="kv">
        <tr><td>Certificate ID</td><td><span class="mono">${pending.certificateId}</span></td></tr>
        <tr><td>Final PDF SHA-256</td><td><span class="mono">${pending.documentHash}</span></td></tr>
        <tr><td>Transaction</td><td><span class="mono">${shorten(receipt.transactionHash, 14, 10)}</span></td></tr>
        <tr><td>Block</td><td>${receipt.blockNumber}</td></tr>
        <tr><td>Blockchain status</td><td>Registered · valid</td></tr>
        <tr><td>Off-chain metadata</td><td>${storedRecord ? "Saved" : "Not saved; transaction is confirmed"}</td></tr>
      </table>
      <div class="qr-box">
        <img class="issued-qr-image" src="${pending.qr.dataUrl}" alt="Verification QR code for ${pending.certificateId}" />
        <div class="qr-actions">
          <a class="btn secondary" href="${pdfBlobUrl}" download="${pending.certificateId}.pdf">Download certificate PDF</a>
          <a class="btn secondary" href="${pending.qr.dataUrl}" download="${pending.certificateId}-qr.png">Download QR (PNG)</a>
        </div>
        <a class="verification-link" href="${escapeHtml(pending.verificationUrl)}">${escapeHtml(pending.verificationUrl)}</a>
      </div>`;
    await loadContractInfo();
    await loadIssuedCertificates();
  } catch (err) {
    const message = err.code === 4001 || err.code === "ACTION_REJECTED"
      ? "Transaction rejected in MetaMask. No certificate was issued."
      : errorMessage(err);
    const result = $("rawIssueResult");
    result.className = "result show error";
    result.textContent = message;
  } finally {
    button.disabled = !$("confirmRawIssue").checked;
    button.textContent = "Issue certificate";
  }
}

function currentBulkMapping() {
  return Object.fromEntries(BULK_MAPPING_FIELDS.map((field) => [
    field.key,
    $(`bulkMap_${field.key}`).value || null,
  ]));
}

function invalidateBulkGeneration() {
  bulkGenerationRevision += 1;
  bulkGeneratedCertificates = [];
  $("bulkGeneratedSummary").replaceChildren();
  $("bulkIssueResult").className = "result";
  $("downloadBulkZipBtn").disabled = true;
  $("confirmBulkIssue").checked = false;
  $("confirmBulkIssue").disabled = true;
  $("issueBulkBtn").disabled = true;
  $("bulkCertificatePreview").hidden = true;
  if (bulkPreviewUrl) scope.revokeObjectURL(bulkPreviewUrl);
  bulkPreviewUrl = null;
}

function renderBulkColumnMapping(headers) {
  const options = ['<option value="">Select a column</option>']
    .concat(headers.map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`))
    .join("");
  $("bulkMappingFields").innerHTML = BULK_MAPPING_FIELDS.map((field) => `
    <div>
      <label for="bulkMap_${field.key}">${field.label}${field.required ? " *" : " (optional)"}</label>
      <select class="field" id="bulkMap_${field.key}">${options}</select>
    </div>`).join("");
  $("bulkColumnMapping").hidden = false;
  for (const select of $("bulkMappingFields").querySelectorAll("select")) {
    select.addEventListener("change", () => {
      invalidateBulkGeneration();
      bulkValidatedRows = [];
      $("bulkValidationSummary").textContent = "Update the mapping and validate the rows again.";
      $("bulkRowReport").replaceChildren();
      $("generateBulkCertificatesBtn").disabled = true;
    });
  }
}

function renderBulkCertificateList() {
  const rows = bulkGeneratedCertificates.map((item) => {
    const studentName = escapeHtml(item.data.studentName || "—");
    const certificateId = escapeHtml(item.certificateId || item.error);
    const status = escapeHtml(item.status);
    const storageMessage = item.storageWarning ? " · metadata not saved" : "";
    return `<div>Row ${item.rowNumber}: ${studentName} · ${certificateId} · ${status}${storageMessage}</div>`;
  }).join("");
  return `<div class="bulk-certificate-list">${rows}</div>`;
}

async function loadBulkCsv(file) {
  invalidateBulkGeneration();
  bulkCsvRecords = [];
  bulkValidatedRows = [];
  bulkGeneratedCertificates = [];
  $("bulkMappingFields").replaceChildren();
  $("bulkColumnMapping").hidden = true;
  $("bulkRowReport").replaceChildren();
  $("bulkGeneratedSummary").replaceChildren();
  $("bulkValidationSummary").textContent = "";
  $("generateBulkCertificatesBtn").disabled = true;
  $("downloadBulkZipBtn").disabled = true;
  $("confirmBulkIssue").disabled = true;
  $("issueBulkBtn").disabled = true;
  if (!file) return;

  try {
    if (!/\.csv$/i.test(file.name) || file.size > 2 * 1024 * 1024) {
      throw new Error("Choose a CSV file no larger than 2 MB.");
    }
    bulkCsvRecords = CertificateWorkflows.parseCsv(await file.text());
    if (bulkCsvRecords.length > 50) throw new Error("A batch may contain at most 50 student rows.");
    const headers = Object.keys(bulkCsvRecords[0]).filter((header) => !header.startsWith("_"));
    renderBulkColumnMapping(headers);
    $("bulkValidationSummary").textContent = `${bulkCsvRecords.length} rows loaded. Map each required field to an uploaded column.`;
  } catch (err) {
    $("bulkValidationSummary").textContent = errorMessage(err);
  }
}

function validateBulkCsvRows() {
  invalidateBulkGeneration();
  const mapping = currentBulkMapping();
  const missingMappings = BULK_MAPPING_FIELDS
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => field.label);
  if (missingMappings.length > 0) {
    $("bulkValidationSummary").textContent = `Map required fields: ${missingMappings.join(", ")}.`;
    return;
  }

  bulkValidatedRows = bulkCsvRecords.map((record) => CertificateWorkflows.validateMappedRecord(record, mapping));
  const total = bulkValidatedRows.length;
  const valid = bulkValidatedRows.filter((row) => row.valid).length;
  const invalid = total - valid;
  const warnings = bulkValidatedRows.reduce((count, row) => count + row.warnings.length, 0);
  $("bulkValidationSummary").textContent = `Total rows: ${total} · Valid: ${valid} · Invalid: ${invalid} · Warnings: ${warnings}`;
  $("bulkRowReport").innerHTML = `<table>
    <thead><tr><th>Row</th><th>Student</th><th>Status</th><th>Errors / warnings</th></tr></thead>
    <tbody>${bulkValidatedRows.map((row) => {
      const messages = [...row.errors, ...row.warnings].join("; ") || "—";
      return `<tr class="${row.valid ? "" : "bulk-row-invalid"}">
        <td>${row.rowNumber}</td><td>${escapeHtml(row.data.studentName || "—")}</td>
        <td>${row.valid ? "Valid" : "Invalid"}</td><td>${escapeHtml(messages)}</td>
      </tr>`;
    }).join("")}</tbody></table>`;
  $("generateBulkCertificatesBtn").disabled = valid === 0;
  $("bulkIssueResult").className = "result";
}

async function generateBulkCertificates() { // NOSONAR -- The workflow keeps validation, generation and UI state changes atomic.
  const validRows = bulkValidatedRows.filter((row) => row.valid);
  if (validRows.length === 0) return;
  const button = $("generateBulkCertificatesBtn");
  if (button.disabled) return;
  const revision = bulkGenerationRevision;
  button.disabled = true;
  button.textContent = "Generating PDFs…";
  bulkGeneratedCertificates = [];
  try {
    const contract = state.contract || createReadonlyContract();
    const existingRecords = await fetchOffchainCertificates();
    const ids = new Set();
    for (const row of validRows) {
      try {
        let certificateId = CertificateWorkflows.createCertificateId();
        while (ids.has(certificateId)) certificateId = CertificateWorkflows.createCertificateId();
        ids.add(certificateId);
        const data = {
          ...row.data,
          dateOfCompletion: row.data.issueDate,
          certificateTitle: $("rawCertificateTitle").value.trim() || "Certificate of Completion",
          issuerName: $("rawIssuerName").value.trim(),
          certificateId,
        };
        const templateId = $("bulkTemplateId").value;
        const templateOptions = getTemplateGenerationOptions(templateId);
        const verificationUrl = getCertificateVerificationUrl(certificateId);
        const qr = await createQrAsset(verificationUrl); // NOSONAR -- Rows are generated sequentially to limit browser memory use.
        const pdfBytes = await CertificateWorkflows.generateCertificatePdf(data, { // NOSONAR -- See sequential generation rationale above.
          ...templateOptions, qrPngBytes: qr.bytes, verificationUrl, PDFLib,
        });
        const documentHash = await CertificateWorkflows.hashPdfBytes(pdfBytes); // NOSONAR -- See sequential generation rationale above.
        const chainStatus = await contract.getCertificateStatus(documentHash); // NOSONAR -- Avoid bursting the local RPC endpoint.
        CertificateWorkflows.assertUniqueCertificateHash(documentHash, chainStatus, existingRecords);
        if (revision !== bulkGenerationRevision) throw new Error("Bulk inputs changed. Generate certificates again.");
        bulkGeneratedCertificates.push({
          rowNumber: row.rowNumber, data, certificateId, templateId, verificationUrl,
          qr, pdfBytes, documentHash, status: "ready",
          generation: { verificationUrl, template: templateOptions.template || null },
        });
      } catch (err) {
        if (revision !== bulkGenerationRevision) throw err;
        bulkGeneratedCertificates.push({ rowNumber: row.rowNumber, data: row.data, status: "failed", error: errorMessage(err) });
      }
    }

    const ready = bulkGeneratedCertificates.filter((item) => item.status === "ready");
    const failed = bulkGeneratedCertificates.length - ready.length;
    if (bulkPreviewUrl) scope.revokeObjectURL(bulkPreviewUrl);
    if (ready.length > 0) {
      bulkPreviewUrl = scope.createObjectURL(new Blob([ready[0].pdfBytes], { type: "application/pdf" }));
      $("bulkCertificatePreview").src = bulkPreviewUrl;
      $("bulkCertificatePreview").hidden = false;
    } else {
      $("bulkCertificatePreview").hidden = true;
    }
    $("bulkGeneratedSummary").innerHTML =
      `<p>Generated: ${ready.length} · Could not generate: ${failed}</p>` + renderBulkCertificateList();
    $("downloadBulkZipBtn").disabled = ready.length === 0;
    $("confirmBulkIssue").disabled = ready.length === 0;
    $("confirmBulkIssue").checked = false;
    $("issueBulkBtn").disabled = true;
  } catch (err) {
    $("bulkIssueResult").className = "result show error";
    $("bulkIssueResult").textContent = errorMessage(err);
  } finally {
    button.disabled = false;
    button.textContent = "Generate valid certificates";
  }
}

async function downloadBulkZip() {
  const downloadable = bulkGeneratedCertificates.filter((item) => item.status === "ready" || item.status === "issued");
  if (downloadable.length === 0) return;
  try {
    const blob = await CertificateWorkflows.createPdfArchive(downloadable, JSZip, "blob");
    const url = scope.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "certverify-certificates.zip";
    anchor.click();
    scope.setTimeout(() => scope.revokeObjectURL(url), 60000);
  } catch (err) {
    $("bulkIssueResult").className = "result show error";
    $("bulkIssueResult").textContent = `Could not create ZIP: ${errorMessage(err)}`;
  }
}

async function issueBulkCertificates() {
  const ready = bulkGeneratedCertificates.filter((item) => item.status === "ready");
  if (!$("confirmBulkIssue").checked || ready.length === 0) return;
  if (!state.signerContract || !state.account) {
    showBanner("Connect the authorized issuer wallet before issuing.");
    return;
  }

  const button = $("issueBulkBtn");
  const result = $("bulkIssueResult");
  button.disabled = true;
  result.className = "result show";
  let issuedCount = 0;
  let failureMessage = "";
  try {
    await ensureCorrectNetwork();
    const authorizedIssuer = await state.signerContract.issuer();
    if (authorizedIssuer.toLowerCase() !== state.account.toLowerCase()) {
      throw new Error("The connected wallet is not authorized to issue certificates.");
    }

    for (const certificate of ready) {
      try {
        result.textContent = `Issuing ${issuedCount + 1} of ${ready.length}: ${certificate.certificateId}. Confirm each transaction in MetaMask.`;
        const metadata = JSON.stringify({
          certificateId: certificate.certificateId,
          issueMethod: "raw-data",
          documentHash: certificate.documentHash,
          templateId: certificate.templateId,
          metadataHash: computeCertificateHash(certificate.data),
        });
        scope.assertActive();
        // Transactions must remain sequential for MetaMask confirmation order and account nonces.
        const tx = await state.signerContract.issueCertificate(certificate.documentHash, metadata); // NOSONAR
        const receipt = await tx.wait(); // NOSONAR
        const record = await storeCertificateOffchain(certificate.documentHash, certificate.data, { // NOSONAR
          txHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          contractAddress: CONFIG.CONTRACT_ADDRESS,
          issuerAddress: receipt.from,
        }, {
          certificateId: certificate.certificateId,
          issueMethod: "raw-data",
          documentHash: certificate.documentHash,
          templateId: certificate.templateId,
          issuerAddress: receipt.from,
          generation: certificate.generation,
        });
        certificate.status = "issued";
        certificate.txHash = receipt.transactionHash;
        certificate.blockNumber = receipt.blockNumber;
        certificate.storageWarning = !record;
        issuedCount += 1;
      } catch (err) {
        certificate.status = "failed";
        certificate.error = err.code === 4001 || err.code === "ACTION_REJECTED"
          ? "Transaction rejected in MetaMask."
          : errorMessage(err);
        failureMessage = `Stopped at row ${certificate.rowNumber}: ${certificate.error}`;
        break;
      }
    }
  } catch (err) {
    failureMessage = errorMessage(err);
  }

  result.className = failureMessage ? "result show error" : "result show";
  result.textContent = `Issued ${issuedCount} of ${ready.length}. ${failureMessage}`;
  $("bulkGeneratedSummary").innerHTML = renderBulkCertificateList();
  $("issueBulkBtn").disabled = true;
  $("confirmBulkIssue").disabled = true;
  await loadContractInfo();
  await loadIssuedCertificates();
}

function setupRawIssuance() {
  loadSavedCustomTemplates();
  updateTemplateSelectors(CertificateWorkflows.DEFAULT_TEMPLATES[0].id);
  $("rawIssueDate").value = new Date().toISOString().slice(0, 10);
  setDesignerControlsFromTemplate(CertificateWorkflows.resolveTemplate($("rawTemplateId").value, savedCustomTemplates));

  const invalidatePreview = () => {
    if (!pendingRawIssue) return;
    pendingRawIssue = null;
    $("rawReview").hidden = true;
    $("rawIssueResult").className = "result";
    if (rawPreviewUrl) scope.revokeObjectURL(rawPreviewUrl);
    $("rawCertificatePreview").hidden = true;
  };
  for (const fieldId of ["rawTemplateId", "rawCertificateTitle", "rawStudentName", "rawCourse", "rawInstitution", "rawIssueDate", "rawIssuerName", "rawGrade"]) {
    $(fieldId).addEventListener("input", invalidatePreview);
    $(fieldId).addEventListener("change", invalidatePreview);
  }
  $("rawTemplateId").addEventListener("change", () => {
    renderTemplateGallery();
    setDesignerControlsFromTemplate(CertificateWorkflows.resolveTemplate($("rawTemplateId").value, savedCustomTemplates));
  });
  $("defaultTemplateGallery").addEventListener("click", (event) => {
    const card = event.target.closest("[data-template-id]");
    if (!card) return;
    for (const id of ["rawTemplateId", "bulkTemplateId"]) {
      $(id).value = card.dataset.templateId;
      $(id).dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  $("confirmRawIssue").addEventListener("change", (event) => {
    $("issueRawBtn").disabled = !event.target.checked;
  });
  for (const input of ["bulkTemplateId", "rawCertificateTitle", "rawIssuerName"]) {
    $(input).addEventListener("input", invalidateBulkGeneration);
    $(input).addEventListener("change", invalidateBulkGeneration);
  }
  $("bulkCsvInput").addEventListener("change", (event) => {
    loadBulkCsv(event.target.files?.[0]).catch((error) => {
      $("bulkValidationSummary").textContent = errorMessage(error);
    });
  });
  $("confirmBulkIssue").addEventListener("change", (event) => {
    $("issueBulkBtn").disabled = !event.target.checked;
  });
  $("removeCustomTemplateBtn").addEventListener("click", () => {
    const selectedId = $("rawTemplateId").value;
    if (!savedCustomTemplates.some((template) => template.id === selectedId)) {
      $("templateDesignerStatus").textContent = "Select a saved custom template in the single certificate form first.";
      return;
    }
    try {
      const remaining = savedCustomTemplates.filter((template) => template.id !== selectedId);
      localStorage.setItem(CUSTOM_TEMPLATE_STORAGE_KEY, JSON.stringify(remaining));
      savedCustomTemplates = remaining;
      updateTemplateSelectors(CertificateWorkflows.DEFAULT_TEMPLATES[0].id);
      invalidatePreview();
      invalidateBulkGeneration();
      $("templateDesignerStatus").textContent = "Custom template removed. Previously issued records keep their saved template snapshot.";
    } catch (error) {
      $("templateDesignerStatus").textContent = errorMessage(error);
    }
  });
  $("templateBackgroundInput").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    $("templateDesignerStatus").textContent = file
      ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB`
      : "";
  });
}

async function issueCertificate() {
  const resultEl = $("issueResult");
  const btn = $("issueBtn");

  hideBanner();
  resultEl.className = "result";

  if (!state.signerContract) {
    showBanner("⚠️ Connect MetaMask first.");
    return;
  }

  let hash;
  try {
    hash = toBytes32($("certHash").value);
  } catch (err) {
    resultEl.className = "result show error";
    resultEl.textContent = "✗ " + err.message;
    return;
  }

  const metadata = $("certMetadata").value.trim() || "{}";
  let metaParsed = {};
  if (metadata !== "{}") {
    try {
      metaParsed = JSON.parse(metadata); // validate before spending gas
      if (!metaParsed || typeof metaParsed !== "object" || Array.isArray(metaParsed)) throw new Error("Enter a JSON object.");
    } catch (err) {
      resultEl.className = "result show error";
      resultEl.textContent = "✗ Metadata is not valid JSON: " + err.message;
      return;
    }
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Confirm in MetaMask…';

  try {
    await ensureCorrectNetwork();
    scope.assertActive();
    const tx = await state.signerContract.issueCertificate(hash, metadata);
    resultEl.className = "result show";
    resultEl.innerHTML =
      `<span class="badge status-notfound">Pending…</span>` +
      `<table class="kv">
         <tr><td>Tx hash</td><td><span class="mono">${shorten(tx.hash, 10, 8)}</span></td></tr>
       </table>
       <p class="dim" style="margin-top:8px;">Waiting for confirmation on Ganache…</p>`;

    const receipt = await tx.wait();

    // Store certificate data off-chain via server API
    await storeCertificateOffchain(hash, metaParsed, {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      contractAddress: CONFIG.CONTRACT_ADDRESS,
    });

    // Build verification URL
    const verifyUrl = getVerificationUrl(hash);

    resultEl.className = "result show";
    resultEl.innerHTML =
      `<span class="badge status-valid">Certificate Issued ✓</span>` +
      `<table class="kv">
         <tr><td>Hash</td><td>${hash}</td></tr>
         <tr><td>Block</td><td>${receipt.blockNumber}</td></tr>
         <tr><td>Gas used</td><td>${receipt.gasUsed.toString()}</td></tr>
         <tr><td>Metadata</td><td>${escapeHtml(metadata)}</td></tr>
       </table>` +
      `<div class="qr-box" style="margin-top:20px;">
         <div style="font-size:0.9rem; font-weight:600; color:var(--text);">Certificate QR Code</div>
         <div class="qr-canvas-frame">
           <canvas id="issueQrCanvas"></canvas>
         </div>
         <div class="qr-actions">
           <button id="issueDownloadQrBtn" class="btn secondary" style="padding:6px 14px; font-size:0.82rem;">⬇️ Download QR (PNG)</button>
           <button id="issueCopyLinkBtn" class="btn secondary" style="padding:6px 14px; font-size:0.82rem;">📋 Copy Verification Link</button>
         </div>
         <div style="font-size:0.75rem; color:var(--text-muted); text-align:center; word-break:break-all;">
           ${escapeHtml(verifyUrl)}
         </div>
       </div>`;

    // Render QR code on canvas
    const canvas = $("issueQrCanvas");
    if (canvas) {
      await renderQrCode(canvas, verifyUrl, { width: 200, margin: 2 });
    }

    // Attach QR download button handler
    $("issueDownloadQrBtn")?.addEventListener("click", () => {
      if (!canvas) return;
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `certificate-${shorten(hash, 6, 6)}.png`;
      a.click();
    });

    // Attach copy link button handler
    $("issueCopyLinkBtn")?.addEventListener("click", async (e) => {
      try {
        await navigator.clipboard.writeText(verifyUrl);
        e.target.textContent = "✓ Link Copied!";
        scope.setTimeout(() => { e.target.textContent = "📋 Copy Verification Link"; }, 2000);
      } catch (err) {
        // Clipboard access can be denied; show the URL so the issuer can copy it manually.
        console.warn("[issuer] Could not copy verification link:", err);
        showBanner("Could not copy the link. Verification URL: " + verifyUrl);
      }
    });

    await loadContractInfo(); // refresh total count
    await loadIssuedCertificates();
  } catch (err) {
    resultEl.className = "result show error";
    resultEl.textContent = "✗ " + errorMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Issue Certificate";
  }
}

/** Generates a random 32-byte hash and example metadata for testing. */
function prefillExample() {
  const randomBytes = ethers.utils.arrayify(ethers.utils.randomBytes(32));
  $("certHash").value = ethers.utils.hexlify(randomBytes);
  $("certMetadata").value = JSON.stringify(
    {
      student: "Alice Kumar",
      course: "B.Tech Computer Science",
      institution: "Example University",
      issuedOn: new Date().toISOString().slice(0, 10),
    },
    null,
    2
  );
}

function certificateIdFor(record) {
  return record.certificateId || record.data?.certificateId || shorten(record.hash, 8, 6);
}

function certificateVerificationUrl(record) {
  return record.certificateId || record.data?.certificateId
    ? getCertificateVerificationUrl(certificateIdFor(record))
    : getVerificationUrl(record.hash);
}

async function loadIssuedCertificates() {
  const summary = $("certificateManagementSummary");
  const tableBody = $("issuedCertificatesBody");
  summary.textContent = "Loading records from the blockchain…";
  tableBody.replaceChildren();
  try {
    const contract = state.contract || createReadonlyContract();
    const [totalValue, offchainRecords] = await Promise.all([
      contract.getTotalIssuedCount(),
      fetchOffchainCertificates(),
    ]);
    const total = totalValue.toNumber();
    const records = [];
    const seenHashes = new Set();

    for (let index = 0; index < total; index += 1) {
      const hash = await contract.getIssuedHashByIndex(index); // NOSONAR -- Enumeration is sequential to avoid flooding the configured RPC.
      const [statusValue, onchainCertificate] = await Promise.all([ // NOSONAR -- See RPC throttling rationale above.
        contract.getCertificateStatus(hash),
        contract.getCertificate(hash),
      ]);
      const statusCode = Number(statusValue);
      let status = "unregistered";
      if (statusCode === 1) status = "valid";
      if (statusCode === 2) status = "revoked";
      const offchain = offchainRecordForHash(offchainRecords, hash);
      const onchainMetadata = parseMetadata(onchainCertificate.metadata);
      const data = offchain?.data || onchainMetadata;
      const certificateId = offchain?.certificateId || data.certificateId || onchainMetadata.certificateId || null;
      const onchainIssuedAt = Number(onchainCertificate.issuedAt.toString());
      records.push({
        ...offchain,
        hash,
        data,
        certificateId,
        status,
        issueMethod: offchain?.issueMethod || onchainMetadata.issueMethod || "legacy",
        issuerAddress: onchainCertificate.issuedBy,
        issuedAt: onchainIssuedAt,
        chainStatusCode: statusCode,
        statusMismatch: !!offchain?.status && offchain.status !== status,
      });
      seenHashes.add(hash.toLowerCase());
    }

    for (const [hash, offchain] of Object.entries(offchainRecords)) {
      if (seenHashes.has(hash.toLowerCase())) continue;
      records.push({
        ...offchain,
        hash: offchain.hash || hash,
        certificateId: offchain.certificateId || offchain.data?.certificateId || null,
        status: "unregistered",
        chainStatusCode: 0,
        statusMismatch: true,
      });
    }

    issuedCertificateRecords = records;
    renderIssuedCertificates();
  } catch (err) {
    summary.textContent = `Could not load certificate records: ${errorMessage(err)}`;
  }
}

function renderIssuedCertificates() {
  const filtered = CertificateWorkflows.filterCertificateRecords(
    issuedCertificateRecords,
    certificateStatusFilter,
    $("certificateSearch").value
  );
  const body = $("issuedCertificatesBody");
  body.innerHTML = filtered.map((record) => {
    const data = record.data || {};
    const status = managementStatus(record.status);
    const issuedDate = managementIssueDate(record.issuedAt, record.storedAt);
    const actions = ["view", "download", "qr", "verify"].map((action) =>
      `<button class="btn btn-ghost" type="button" data-cert-action="${action}" data-cert-hash="${escapeHtml(record.hash)}">${action === "qr" ? "QR" : action[0].toUpperCase() + action.slice(1)}</button>`
    ).join("");
    const revokeAction = record.status === "valid"
      ? `<button class="btn btn-danger" type="button" data-cert-action="revoke" data-cert-hash="${escapeHtml(record.hash)}">Revoke</button>`
      : "";
    return `<tr>
      <td class="mono">${escapeHtml(certificateIdFor(record))}</td>
      <td>${escapeHtml(data.studentName || data.student || "—")}</td>
      <td>${escapeHtml(data.course || data.certificateTitle || "—")}</td>
      <td>${escapeHtml(issuedDate)}</td>
      <td><span class="badge ${status.css}">${status.text}${record.statusMismatch ? " · data mismatch" : ""}</span></td>
      <td class="mono">${record.onChain?.txHash ? escapeHtml(shorten(record.onChain.txHash, 8, 6)) : "—"}</td>
      <td>${actions}${revokeAction}</td>
    </tr>`;
  }).join("");

  const counts = {
    total: issuedCertificateRecords.length,
    valid: issuedCertificateRecords.filter((record) => record.status === "valid").length,
    revoked: issuedCertificateRecords.filter((record) => record.status === "revoked").length,
  };
  $("certificateManagementSummary").textContent = `All ${counts.total} · Valid ${counts.valid} · Revoked ${counts.revoked}`;
  $("certificateListEmpty").hidden = filtered.length > 0;
}

async function showCertificateDetails(record, showQr = false) {
  selectedCertificateRecord = record;
  const data = record.data || {};
  const verificationUrl = certificateVerificationUrl(record);
  const status = managementStatus(record.status);
  $("certificateDetailsTitle").textContent = certificateIdFor(record);
  $("certificateDetailsContent").innerHTML = `<table class="kv">
    <tr><td>Student</td><td>${escapeHtml(data.studentName || data.student || "—")}</td></tr>
    <tr><td>Course / type</td><td>${escapeHtml(data.course || data.certificateTitle || "—")}</td></tr>
    <tr><td>Institution</td><td>${escapeHtml(data.institution || "—")}</td></tr>
    <tr><td>Issue method</td><td>${escapeHtml(record.issueMethod || "legacy")}</td></tr>
    <tr><td>Document hash</td><td><span class="mono">${escapeHtml(record.hash)}</span></td></tr>
    <tr><td>Issuer</td><td><span class="mono">${escapeHtml(record.issuerAddress || "—")}</span></td></tr>
    <tr><td>Blockchain status</td><td>${status.text}</td></tr>
    <tr><td>Transaction</td><td><span class="mono">${escapeHtml(record.onChain?.txHash || "—")}</span></td></tr>
  </table>`;
  $("certificateDetailsVerify").href = verificationUrl;
  $("certificateDetailsRevoke").disabled = record.status !== "valid";
  $("certificateDetailsMessage").textContent = record.statusMismatch
    ? "Off-chain status disagrees with the blockchain. Blockchain status is authoritative."
    : "";
  try {
    const qr = await createQrAsset(verificationUrl);
    $("certificateDetailsQr").src = qr.dataUrl;
    $("certificateDetailsQr").hidden = !showQr && record.issueMethod === "pdf";
    if (showQr) $("certificateDetailsQr").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) {
    $("certificateDetailsMessage").textContent = `Could not render QR: ${errorMessage(err)}`;
  }
  $("certificateDetails").hidden = false;
}

function downloadBlob(blob, filename) {
  const url = scope.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  scope.setTimeout(() => scope.revokeObjectURL(url), 60000);
}

async function downloadManagedCertificate(record) {
  const certificateId = certificateIdFor(record);
  if (record.issueMethod === "pdf") {
    const originalFile = activePdfDocuments.get(record.certificateId || record.data?.certificateId);
    if (!originalFile) {
      $("certificateDetailsMessage").textContent = "The uploaded PDF is not retained after the issuance session.";
      return;
    }
    downloadBlob(originalFile, originalFile.name || `${certificateId}.pdf`);
    return;
  }
  if (record.issueMethod !== "raw-data" || !record.templateId) {
    $("certificateDetailsMessage").textContent = "This legacy hash record has no retained PDF document.";
    return;
  }

  try {
    const verificationUrl = record.generation?.verificationUrl || certificateVerificationUrl(record);
    const qr = await createQrAsset(verificationUrl);
    const savedTemplate = record.generation?.template;
    const pdfBytes = await CertificateWorkflows.generateCertificatePdf(record.data, {
      ...(savedTemplate ? { template: savedTemplate, backgroundBytes: dataUrlToBytes(savedTemplate.imageDataUrl), backgroundMime: savedTemplate.imageMime, backgroundOpacity: savedTemplate.backgroundOpacity } : getTemplateGenerationOptions(record.templateId)),
      qrPngBytes: qr.bytes,
      verificationUrl,
      PDFLib,
    });
    const regeneratedHash = await CertificateWorkflows.hashPdfBytes(pdfBytes);
    if (regeneratedHash.toLowerCase() !== record.hash.toLowerCase()) {
      throw new Error("Regenerated PDF does not match its blockchain hash; download was stopped.");
    }
    downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), `${certificateId}.pdf`);
  } catch (err) {
    $("certificateDetailsMessage").textContent = errorMessage(err);
  }
}

async function handleCertificateTableAction(event) {
  const button = event.target.closest("[data-cert-action]");
  if (!button) return;
  const record = issuedCertificateRecords.find((item) => item.hash.toLowerCase() === button.dataset.certHash.toLowerCase());
  if (!record) return;

  const action = button.dataset.certAction;
  if (action === "verify") {
    window.open(certificateVerificationUrl(record), "_blank", "noopener");
    return;
  }
  if (action === "revoke") {
    await showCertificateDetails(record);
    openRevocationDialog(record);
    return;
  }
  await showCertificateDetails(record, action === "qr");
  if (action === "download") await downloadManagedCertificate(record);
}

function openRevocationDialog(record) {
  if (record?.status !== "valid") return;
  pendingRevocationRecord = record;
  $("revokeConfirmationText").textContent = `Revoke ${certificateIdFor(record)}? This action is irreversible and blockchain status is authoritative.`;
  $("revokeConfirmDialog").showModal();
}

async function confirmCertificateRevocation() {
  const record = pendingRevocationRecord;
  if (record?.status !== "valid") return;
  if (!state.signerContract || !state.account) {
    $("certificateDetailsMessage").textContent = "Connect the authorized issuer wallet before revoking.";
    return;
  }

  const button = $("confirmRevokeBtn");
  button.disabled = true;
  button.textContent = "Confirm in MetaMask…";
  try {
    await ensureCorrectNetwork();
    const authorizedIssuer = await state.signerContract.issuer();
    if (authorizedIssuer.toLowerCase() !== state.account.toLowerCase()) {
      throw new Error("The connected wallet is not authorized to revoke certificates.");
    }
    const currentStatus = Number(await state.signerContract.getCertificateStatus(record.hash));
    if (currentStatus !== 1) throw new Error("This certificate is no longer valid on-chain.");

    scope.assertActive();
    const tx = await state.signerContract.revokeCertificate(record.hash);
    const receipt = await tx.wait();
    let storageWarning = "";
    try {
      await updateCertificateStatusOffchain(record.hash, "revoked", {
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        revokedAt: new Date().toISOString(),
      });
    } catch (err) {
      storageWarning = ` Blockchain revocation confirmed; off-chain status update failed: ${errorMessage(err)}`;
    }

    $("revokeConfirmDialog").close();
    await loadIssuedCertificates();
    const updatedRecord = issuedCertificateRecords.find((item) => item.hash.toLowerCase() === record.hash.toLowerCase());
    if (updatedRecord) await showCertificateDetails(updatedRecord);
    $("certificateDetailsMessage").textContent = `Revoked on-chain in block ${receipt.blockNumber}.${storageWarning}`;
  } catch (err) {
    const message = err.code === 4001 || err.code === "ACTION_REJECTED"
      ? "Transaction rejected in MetaMask. Certificate remains unchanged."
      : errorMessage(err);
    $("certificateDetailsMessage").textContent = message;
  } finally {
    pendingRevocationRecord = null;
    button.disabled = false;
    button.textContent = "Confirm revocation";
  }
}

function setupCertificateManagement() {
  $("issuedCertificatesBody").addEventListener("click", (event) => {
    handleCertificateTableAction(event).catch((error) => {
      $("certificateDetailsMessage").textContent = errorMessage(error);
    });
  });
  $("certificateDetailsDownload").addEventListener("click", () => {
    if (selectedCertificateRecord) {
      downloadManagedCertificate(selectedCertificateRecord).catch((error) => {
        $("certificateDetailsMessage").textContent = errorMessage(error);
      });
    }
  });
  $("certificateDetailsRevoke").addEventListener("click", () => {
    if (selectedCertificateRecord) openRevocationDialog(selectedCertificateRecord);
  });
  $("closeCertificateDetails").addEventListener("click", () => {
    $("certificateDetails").hidden = true;
    selectedCertificateRecord = null;
  });
  $("certificateSearch").addEventListener("input", renderIssuedCertificates);
  for (const button of scope.queryAll("[data-certificate-filter]")) {
    button.addEventListener("click", () => {
      certificateStatusFilter = button.dataset.certificateFilter;
      for (const filterButton of scope.queryAll("[data-certificate-filter]")) {
        filterButton.setAttribute("aria-pressed", String(filterButton === button));
      }
      renderIssuedCertificates();
    });
  }
  $("cancelRevokeBtn").addEventListener("click", () => {
    pendingRevocationRecord = null;
    $("revokeConfirmDialog").close();
  });
  loadIssuedCertificates().catch((error) => {
    $("certificateManagementSummary").textContent = errorMessage(error);
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------


async function initialize() {
  setupPdfIssuance();
  setupRawIssuance();
  setupCertificateManagement();
  await Promise.all([loadContractInfo(), loadIssuerInfo()]);

}
return { initialize, onWalletConnected, onAccountChanged, loadContractInfo, loadIssuerInfo, pdfIssueData, setPdfReviewMessage, preparePdfReview, dataUrlToBytes, issueUploadedPdf, setupPdfIssuance, rawCertificateData, createQrAsset, loadSavedCustomTemplates, updateTemplateSelectors, renderTemplateGallery, getTemplateGenerationOptions, setDesignerControlsFromTemplate, readFileAsDataUrl, saveCustomTemplate, generateRawPreview, issueGeneratedCertificate, currentBulkMapping, invalidateBulkGeneration, renderBulkColumnMapping, renderBulkCertificateList, loadBulkCsv, validateBulkCsvRows, generateBulkCertificates, downloadBulkZip, issueBulkCertificates, setupRawIssuance, issueCertificate, prefillExample, offchainRecordForHash, certificateIdFor, certificateVerificationUrl, managementStatus, managementIssueDate, loadIssuedCertificates, renderIssuedCertificates, showCertificateDetails, downloadBlob, downloadManagedCertificate, handleCertificateTableAction, openRevocationDialog, confirmCertificateRevocation, setupCertificateManagement };
}
module.exports = { createIssuerController };

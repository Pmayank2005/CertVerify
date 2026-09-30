(function (root) {
  const MAX_PDF_BYTES = 10 * 1024 * 1024;
  const REQUIRED_CERTIFICATE_FIELDS = ["studentName", "course", "institution", "issueDate"];
  const LEGACY_TEMPLATES = [
    {
      id: "certverify-emerald",
      name: "Emerald Classic",
      background: [0.97, 0.98, 0.95],
      accent: [0.08, 0.34, 0.25],
      ink: [0.08, 0.14, 0.13],
      title: "CERTIFICATE OF COMPLETION",
      fields: [
        { key: "institution", x: 0.5, y: 0.82, width: 0.68, align: "center", size: 14, bold: true },
        { key: "certificateTitle", x: 0.5, y: 0.68, width: 0.78, align: "center", size: 25, bold: true },
        { key: "studentName", x: 0.5, y: 0.53, width: 0.78, align: "center", size: 30, bold: true },
        { key: "course", x: 0.5, y: 0.40, width: 0.75, align: "center", size: 19, bold: true },
        { key: "issueDate", x: 0.15, y: 0.18, width: 0.25, align: "left", size: 10 },
        { key: "grade", x: 0.5, y: 0.18, width: 0.2, align: "center", size: 10 },
        { key: "issuerName", x: 0.15, y: 0.09, width: 0.36, align: "left", size: 10 },
        { key: "certificateId", x: 0.82, y: 0.18, width: 0.25, align: "right", size: 9 },
      ],
      qr: { x: 0.84, y: 0.045, size: 0.105 },
      signature: { x: 0.57, y: 0.115, width: 0.18, label: "Authorized signature" },
    },
    {
      id: "certverify-midnight",
      name: "Midnight Seal",
      background: [0.94, 0.96, 0.96],
      accent: [0.10, 0.27, 0.34],
      ink: [0.08, 0.13, 0.17],
      title: "CERTIFICATE OF ACHIEVEMENT",
      fields: [
        { key: "institution", x: 0.5, y: 0.84, width: 0.65, align: "center", size: 13, bold: true },
        { key: "certificateTitle", x: 0.5, y: 0.69, width: 0.82, align: "center", size: 24, bold: true },
        { key: "studentName", x: 0.5, y: 0.52, width: 0.72, align: "center", size: 29, bold: true },
        { key: "course", x: 0.5, y: 0.39, width: 0.72, align: "center", size: 18, bold: true },
        { key: "issuerName", x: 0.16, y: 0.17, width: 0.3, align: "left", size: 10 },
        { key: "issueDate", x: 0.5, y: 0.17, width: 0.24, align: "center", size: 10 },
        { key: "grade", x: 0.75, y: 0.17, width: 0.17, align: "right", size: 10 },
        { key: "certificateId", x: 0.16, y: 0.09, width: 0.45, align: "left", size: 9 },
      ],
      qr: { x: 0.84, y: 0.045, size: 0.105 },
      signature: { x: 0.56, y: 0.105, width: 0.19, label: "Authorized signature" },
    },
  ];

  // Artwork remains untouched. Opaque PDF panels replace the sample identities,
  // signatures and QR codes before real certificate fields are drawn.
  function artworkTemplate(id, name, filename, spec) {
    return {
      id, name, backgroundUrl: `templates/${filename}`, backgroundOpacity: 1,
      pageSize: [842, 842 * 2 / 3], frame: false,
      background: [0.97, 0.96, 0.92], accent: spec.accent || [0.03, 0.35, 0.26],
      ink: [0.025, 0.10, 0.14], title: "CERTIFICATE OF ACHIEVEMENT",
      panels: spec.panels,
      fields: spec.fields.map(([key, x, y, width, size, bold = false]) => ({
        key, x: x / 1536, y: 1 - y / 1024, width: width / 1536,
        size, bold, align: "center",
      })),
      qr: { x: spec.qr[0] / 1536, y: 1 - (spec.qr[1] + spec.qr[2]) / 1024, size: spec.qr[2] / 1536 },
      signature: null,
    };
  }

  const DEFAULT_TEMPLATES = [
    artworkTemplate("certverify-emerald-ribbon-v1", "Emerald Ribbon", "emerald-ribbon.png", {
      panels: [[280, 205, 820, 370], [290, 590, 750, 115], [145, 750, 230, 110], [620, 750, 250, 110], [930, 735, 250, 150]],
      fields: [["certificateTitle", 675, 315, 790, 26, true], ["studentName", 675, 515, 790, 34, true], ["course", 665, 630, 720, 18, true], ["institution", 665, 670, 720, 13], ["issueDate", 260, 805, 210, 11], ["certificateId", 745, 805, 230, 9], ["issuerName", 1055, 805, 230, 12], ["grade", 665, 700, 500, 10]],
      qr: [1340, 720, 110],
    }),
    artworkTemplate("certverify-gold-seal-v1", "Gold Seal", "gold-seal.png", {
      accent: [0.55, 0.36, 0.09],
      panels: [[325, 167, 780, 145], [390, 390, 650, 120], [340, 530, 775, 85], [270, 675, 225, 36], [555, 675, 335, 36], [965, 675, 205, 36], [205, 745, 265, 170]],
      fields: [["certificateTitle", 715, 260, 755, 25, true], ["studentName", 715, 470, 620, 34, true], ["institution", 715, 565, 740, 15], ["grade", 715, 605, 730, 11], ["certificateId", 383, 699, 205, 9], ["course", 722, 699, 315, 12, true], ["issueDate", 1067, 699, 190, 11], ["issuerName", 338, 842, 245, 12]],
      qr: [1095, 770, 105],
    }),
    artworkTemplate("certverify-laurel-v1", "Laurel of Excellence", "laurel.png", {
      panels: [[525, 138, 710, 125], [580, 333, 610, 103], [530, 493, 720, 97], [392, 650, 250, 37], [717, 650, 350, 37], [1148, 650, 245, 37], [408, 732, 225, 145], [1102, 732, 245, 145]],
      fields: [["certificateTitle", 880, 225, 680, 23, true], ["studentName", 880, 403, 590, 32, true], ["institution", 880, 540, 690, 15], ["grade", 880, 580, 680, 11], ["certificateId", 517, 675, 230, 9], ["course", 892, 675, 330, 12, true], ["issueDate", 1270, 675, 220, 11], ["issuerName", 520, 815, 210, 12]],
      qr: [827, 741, 96],
    }),
    artworkTemplate("certverify-gold-banner-v1", "Golden Banner", "golden-banner.png", {
      accent: [0.55, 0.36, 0.09],
      panels: [[380, 150, 735, 127], [435, 377, 610, 125], [421, 516, 710, 99], [235, 643, 225, 33], [543, 643, 290, 33], [918, 643, 235, 33], [231, 740, 245, 158], [908, 742, 250, 155], [1252, 570, 207, 289]],
      fields: [["certificateTitle", 744, 240, 700, 24, true], ["studentName", 740, 449, 590, 32, true], ["grade", 770, 574, 680, 14], ["issueDate", 347, 667, 205, 11], ["course", 688, 667, 270, 12, true], ["institution", 1035, 667, 220, 11], ["issuerName", 353, 822, 225, 12], ["certificateId", 1355, 620, 190, 8]],
      qr: [1270, 207, 115],
    }),
  ];

  function asBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new TypeError("Expected PDF bytes as a Uint8Array or ArrayBuffer");
  }

  function getCryptoProvider() {
    if (root.crypto?.subtle) return root.crypto;
    if (typeof require === "function") return require("node:crypto").webcrypto;
    throw new Error("SHA-256 is unavailable in this environment");
  }

  async function hashPdfBytes(value) {
    const bytes = asBytes(value);
    const digest = await getCryptoProvider().subtle.digest("SHA-256", bytes);
    return "0x" + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function validatePdfBytes(value, maxBytes = MAX_PDF_BYTES) {
    const bytes = asBytes(value);
    if (bytes.length === 0) throw new Error("The selected PDF is empty.");
    if (bytes.length > maxBytes) throw new Error("The selected PDF exceeds the 10 MB limit.");
    const signature = String.fromCodePoint(...bytes.subarray(0, 5));
    if (signature !== "%PDF-") throw new Error("The selected file is not a valid PDF document.");
    return { size: bytes.length, bytes };
  }

  function validatePdfFile(file, bytes) {
    if (!file || !/\.pdf$/i.test(file.name || "") || (file.type && file.type !== "application/pdf")) {
      throw new Error("Choose a PDF file with a .pdf extension.");
    }
    if (file.size > MAX_PDF_BYTES) throw new Error("The selected PDF exceeds the 10 MB limit.");
    return validatePdfBytes(bytes);
  }

  function createCertificateId(now = new Date()) {
    const random = new Uint8Array(5);
    getCryptoProvider().getRandomValues(random);
    const suffix = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    const date = now.toISOString().slice(0, 10).replaceAll("-", "");
    return `CV-${date}-${suffix}`;
  }

  function assertUniqueCertificateHash(hash, chainStatus, records = {}) {
    const normalizedHash = hash.toLowerCase();
    const storedHashExists = Object.keys(records).some((storedHash) => storedHash.toLowerCase() === normalizedHash);
    if (Number(chainStatus) !== 0 || storedHashExists) {
      throw new Error("A certificate with this document hash is already registered.");
    }
    return true;
  }

  function normalizeCell(value) {
    return String(value ?? "").trim();
  }

  function finishCsvCell(state) {
    state.row.push(state.cell);
    state.cell = "";
  }

  function finishCsvRow(state, rows) {
    finishCsvCell(state);
    if (state.row.some((value) => normalizeCell(value) !== "")) rows.push(state.row);
    state.row = [];
  }

  function readQuotedCsvCharacter(source, index, state) {
    if (source[index] !== '"') {
      state.cell += source[index];
      return 1;
    }
    if (source[index + 1] === '"') {
      state.cell += '"';
      return 2;
    }
    state.quoted = false;
    return 1;
  }

  function readUnquotedCsvCharacter(source, index, state, rows) {
    const character = source[index];
    if (character === '"') state.quoted = true;
    else if (character === ",") finishCsvCell(state);
    else if (character === "\n" || character === "\r") {
      finishCsvRow(state, rows);
      return character === "\r" && source[index + 1] === "\n" ? 2 : 1;
    } else state.cell += character;
    return 1;
  }

  function parseCsv(text) {
    const source = String(text || "").replace(/^\uFEFF/, "");
    const rows = [];
    const state = { row: [], cell: "", quoted: false };

    let index = 0;
    while (index < source.length) {
      index += state.quoted
        ? readQuotedCsvCharacter(source, index, state)
        : readUnquotedCsvCharacter(source, index, state, rows);
    }

    if (state.quoted) throw new Error("CSV contains an unterminated quoted field.");
    finishCsvRow(state, rows);
    if (rows.length < 2) throw new Error("CSV must contain a header and at least one data row.");

    const headers = rows[0].map(normalizeCell);
    if (headers.some((header) => !header)) throw new Error("Every CSV column needs a header.");
    if (headers.some((header) => ["__proto__", "constructor", "prototype", "_rowNumber", "_parseError"].includes(header))) {
      throw new Error("CSV contains a reserved column header. Rename that column before importing.");
    }
    if (new Set(headers).size !== headers.length) throw new Error("CSV column headers must be unique.");
    return rows.slice(1).map((values, index) => {
      const record = { _rowNumber: index + 2 };
      headers.forEach((header, columnIndex) => { record[header] = normalizeCell(values[columnIndex]); });
      if (values.length > headers.length) record._parseError = "Row has more values than the header.";
      return record;
    });
  }

  function validateMappedRecord(record, mapping) {
    const data = {};
    for (const field of REQUIRED_CERTIFICATE_FIELDS) {
      const column = mapping[field];
      data[field] = column ? normalizeCell(record[column]) : "";
    }
    data.grade = mapping.grade ? normalizeCell(record[mapping.grade]) : "";
    const errors = [];
    const warnings = [];
    if (record._parseError) errors.push(record._parseError);
    for (const field of REQUIRED_CERTIFICATE_FIELDS) {
      if (!data[field]) errors.push(`Missing ${field}`);
    }
    if (data.issueDate && !isValidDate(data.issueDate)) errors.push("Invalid issue date");
    if (!data.grade) warnings.push("No grade provided");
    return { rowNumber: record._rowNumber, data, errors, warnings, valid: errors.length === 0 };
  }

  function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function cleanPdfText(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "?");
  }

  function fitText(text, font, requestedSize, maxWidth, fieldKey) {
    let size = requestedSize;
    while (size > 6 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
    if (font.widthOfTextAtSize(text, size) > maxWidth) {
      const label = fieldKey.replace(/([A-Z])/g, " $1").toLowerCase();
      const hint = fieldKey === "issuerName" ? " Enter the issuer's name instead of a wallet address, or leave it blank." : " Shorten it before generating.";
      throw new Error(`The ${label} field is too long for this template.${hint}`);
    }
    return size;
  }

  async function drawTemplateBackground(document, page, options) {
    if (!options.backgroundBytes) return;
    const imageBytes = asBytes(options.backgroundBytes);
    const image = options.backgroundMime === "image/jpeg"
      ? await document.embedJpg(imageBytes)
      : await document.embedPng(imageBytes);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
      opacity: options.backgroundOpacity ?? 0.82,
    });
  }

  function drawTemplateFrame(page, template, rgb) {
    if (template.frame === false) return;
    const [accentRed, accentGreen, accentBlue] = template.accent;
    const accent = rgb(accentRed, accentGreen, accentBlue);
    page.drawRectangle({ x: 24, y: 24, width: 794, height: 547, borderColor: accent, borderWidth: 2 });
    page.drawRectangle({ x: 38, y: 38, width: 766, height: 519, borderColor: accent, borderWidth: 0.6 });
    page.drawRectangle({ x: 40, y: 548, width: 762, height: 9, color: accent });
  }

  function drawTemplateFields(page, template, data, fonts, rgb) {
    const [inkRed, inkGreen, inkBlue] = template.ink;
    for (const field of template.fields) {
      const value = field.key === "certificateTitle" ? (data.certificateTitle || template.title) : data[field.key];
      if (!value) continue;
      const text = cleanPdfText(value);
      const font = field.bold ? fonts.bold : fonts.regular;
      const maxWidth = field.width * page.getWidth();
      const fontSize = fitText(text, font, field.size, maxWidth, field.key);
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      let alignmentOffset = 0;
      if (field.align === "center") alignmentOffset = textWidth / 2;
      if (field.align === "right") alignmentOffset = textWidth;
      page.drawText(text, {
        x: field.x * page.getWidth() - alignmentOffset,
        y: field.y * page.getHeight(),
        size: fontSize,
        font,
        color: rgb(inkRed, inkGreen, inkBlue),
        maxWidth,
      });
    }
  }

  async function drawTemplateQr(document, page, template, qrPngBytes) {
    if (!qrPngBytes) return;
    const qrImage = await document.embedPng(asBytes(qrPngBytes));
    const qrSize = template.qr.size * page.getWidth();
    page.drawImage(qrImage, {
      x: template.qr.x * page.getWidth(),
      y: template.qr.y * page.getHeight(),
      width: qrSize,
      height: qrSize,
    });
  }

  function drawSignatureArea(page, template, regularFont, rgb) {
    if (!template.signature) return;
    const [accentRed, accentGreen, accentBlue] = template.accent;
    const startX = template.signature.x * 842;
    const lineY = template.signature.y * 595;
    const lineWidth = template.signature.width * 842;
    const accent = rgb(accentRed, accentGreen, accentBlue);
    page.drawLine({
      start: { x: startX, y: lineY },
      end: { x: startX + lineWidth, y: lineY },
      thickness: 0.8,
      color: accent,
    });
    page.drawText(cleanPdfText(template.signature.label || "Authorized signature"), {
      x: startX,
      y: lineY - 13,
      size: 8,
      font: regularFont,
      color: accent,
      maxWidth: lineWidth,
    });
  }

  function resolveTemplate(templateId, customTemplates = []) {
    // Keep legacy IDs readable for existing records; only the four new designs
    // appear in the default selector.
    const normalizedId = templateId?.replace(/^certchain-/, "certverify-");
    const template = customTemplates.find((template) => template.id === templateId)
      || DEFAULT_TEMPLATES.find((template) => template.id === templateId)
      || LEGACY_TEMPLATES.find((template) => template.id === normalizedId);
    if (template) return template;
    if (!templateId) return DEFAULT_TEMPLATES[0];
    throw new Error("Certificate template is unavailable. Restore the saved template before regenerating.");
  }

  const backgroundCache = new Map();
  async function loadTemplateBackground(template) {
    if (!template.backgroundUrl) return null;
    if (!backgroundCache.has(template.backgroundUrl)) {
      const request = (async () => {
        if (typeof window === "undefined" && typeof require === "function") {
          return new Uint8Array(await require("node:fs/promises").readFile(require("node:path").join(__dirname, template.backgroundUrl)));
        }
        const response = await fetch(template.backgroundUrl);
        if (!response.ok) throw new Error(`Could not load template artwork (${response.status}). Please retry.`);
        return new Uint8Array(await response.arrayBuffer());
      })();
      backgroundCache.set(template.backgroundUrl, request);
      request.catch(() => backgroundCache.delete(template.backgroundUrl));
    }
    return backgroundCache.get(template.backgroundUrl);
  }

  async function generateCertificatePdf(data, options = {}) {
    const pdfLib = options.PDFLib || root.PDFLib;
    if (!pdfLib?.PDFDocument) throw new Error("PDF generation library is not loaded.");
    const template = options.template || resolveTemplate(options.templateId, options.customTemplates);
    for (const field of REQUIRED_CERTIFICATE_FIELDS) {
      if (!String(data[field] || "").trim()) throw new Error(`Missing ${field}`);
    }
    if (!isValidDate(data.issueDate)) throw new Error("Invalid issue date");
    if (template.backgroundUrl && !options.qrPngBytes) throw new Error("A verification QR is required for artwork templates.");
    const { PDFDocument, StandardFonts, rgb } = pdfLib;
    const document = await PDFDocument.create();
    const stableDate = new Date(`${data.issueDate}T00:00:00.000Z`);
    document.setCreationDate(stableDate);
    document.setModificationDate(stableDate);
    const page = document.addPage(template.pageSize || [842, 595]);
    const regularFont = await document.embedFont(StandardFonts.Helvetica);
    const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
    const fonts = { regular: regularFont, bold: boldFont };
    const [backgroundRed, backgroundGreen, backgroundBlue] = template.background;
    page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: rgb(backgroundRed, backgroundGreen, backgroundBlue) });
    const backgroundBytes = options.backgroundBytes || await loadTemplateBackground(template);
    await drawTemplateBackground(document, page, { ...options, backgroundBytes, backgroundOpacity: options.backgroundOpacity ?? template.backgroundOpacity });
    for (const [x, y, width, height] of template.panels || []) {
      page.drawRectangle({ x: x / 1536 * page.getWidth(), y: (1 - (y + height) / 1024) * page.getHeight(), width: width / 1536 * page.getWidth(), height: height / 1024 * page.getHeight(), color: rgb(backgroundRed, backgroundGreen, backgroundBlue) });
    }
    drawTemplateFrame(page, template, rgb);
    drawTemplateFields(page, template, data, fonts, rgb);
    drawSignatureArea(page, template, regularFont, rgb);
    await drawTemplateQr(document, page, template, options.qrPngBytes);
    return document.save();
  }

  async function createPdfArchive(certificates, ZipLibrary = root.JSZip, outputType = "uint8array") {
    if (typeof ZipLibrary !== "function") throw new Error("ZIP library is not loaded.");
    const archive = new ZipLibrary();
    for (const certificate of certificates) {
      if (certificate.status !== "ready" && certificate.status !== "issued") continue;
      archive.file(`${certificate.certificateId}.pdf`, asBytes(certificate.pdfBytes));
    }
    return archive.generateAsync({ type: outputType });
  }

  function filterCertificateRecords(records, statusFilter = "all", searchText = "") {
    const query = String(searchText || "").trim().toLowerCase();
    return records.filter((record) => {
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      if (!query) return true;
      const data = record.data || {};
      const searchable = [record.certificateId, record.hash, data.certificateId, data.studentName, data.student]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(query);
    });
  }

  const workflows = {
    MAX_PDF_BYTES,
    REQUIRED_CERTIFICATE_FIELDS,
    DEFAULT_TEMPLATES,
    resolveTemplate,
    asBytes,
    hashPdfBytes,
    validatePdfBytes,
    validatePdfFile,
    createCertificateId,
    assertUniqueCertificateHash,
    parseCsv,
    validateMappedRecord,
    generateCertificatePdf,
    createPdfArchive,
    filterCertificateRecords,
  };

  root.CertificateWorkflows = workflows;
  if (typeof module !== "undefined" && module.exports) module.exports = workflows;
})(typeof window !== "undefined" ? window : globalThis);

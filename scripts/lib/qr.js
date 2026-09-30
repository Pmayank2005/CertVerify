/**
 * QR Code Generation Module (Phase 3)
 *
 * Provides utilities to generate QR codes encoding certificate hashes
 * or deep-link verification URLs. Supports data URLs (base64 PNG), SVG strings,
 * and saving directly to disk.
 *
 * Usage:
 *   const { generateVerificationUrl, generateQrDataUrl, generateQrSvg, saveQrImage } = require("./lib/qr");
 *   const url = generateVerificationUrl("0x1234...");
 *   const dataUrl = await generateQrDataUrl(url);
 */

const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

const DEFAULT_BASE_URL = "http://localhost:8080";

/**
 * Builds the verification URL for a given certificate hash.
 *
 * @param {string} hash - 0x-prefixed 32-byte hash
 * @param {string} [baseUrl] - Base URL of the verification frontend
 * @returns {string} Fully qualified or relative verification URL
 */
function generateVerificationUrl(hash, baseUrl = DEFAULT_BASE_URL) {
  if (!hash || typeof hash !== "string") {
    throw new Error("Certificate hash must be a non-empty string");
  }
  const cleanBase = baseUrl.replace(/\/+$/, "");
  return `${cleanBase}/verifier.html?hash=${encodeURIComponent(hash.trim())}`;
}

/**
 * Generates a PNG Data URL (data:image/png;base64,...) for the given text.
 *
 * @param {string} text - Content to encode (URL or hash)
 * @param {Object} [options] - QRCode options (width, margin, color, errorCorrectionLevel)
 * @returns {Promise<string>} Base64 Data URL string
 */
async function generateQrDataUrl(text, options = {}) {
  if (!text || typeof text !== "string") {
    throw new Error("Text to encode must be a non-empty string");
  }

  const opts = {
    errorCorrectionLevel: options.errorCorrectionLevel || "M",
    margin: options.margin !== undefined ? options.margin : 2,
    width: options.width || 300,
    color: {
      dark: options.darkColor || "#000000",
      light: options.lightColor || "#ffffff",
    },
  };

  return QRCode.toDataURL(text, opts);
}

/**
 * Generates an SVG string representation of the QR code.
 *
 * @param {string} text - Content to encode
 * @param {Object} [options] - QRCode options
 * @returns {Promise<string>} SVG markup string
 */
async function generateQrSvg(text, options = {}) {
  if (!text || typeof text !== "string") {
    throw new Error("Text to encode must be a non-empty string");
  }

  const opts = {
    type: "svg",
    errorCorrectionLevel: options.errorCorrectionLevel || "M",
    margin: options.margin !== undefined ? options.margin : 2,
    width: options.width || 300,
    color: {
      dark: options.darkColor || "#000000",
      light: options.lightColor || "#ffffff",
    },
  };

  return QRCode.toString(text, opts);
}

/**
 * Saves a QR code PNG file to disk.
 *
 * @param {string} text - Content to encode
 * @param {string} outputPath - Target file path (.png)
 * @param {Object} [options] - QRCode options
 * @returns {Promise<string>} Output path
 */
async function saveQrImage(text, outputPath, options = {}) {
  if (!text || typeof text !== "string") {
    throw new Error("Text to encode must be a non-empty string");
  }
  if (!outputPath || typeof outputPath !== "string") {
    throw new Error("Output path must be a non-empty string");
  }

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const opts = {
    errorCorrectionLevel: options.errorCorrectionLevel || "M",
    margin: options.margin !== undefined ? options.margin : 2,
    width: options.width || 300,
    color: {
      dark: options.darkColor || "#000000",
      light: options.lightColor || "#ffffff",
    },
  };

  await QRCode.toFile(outputPath, text, opts);
  return outputPath;
}

module.exports = {
  DEFAULT_BASE_URL,
  generateVerificationUrl,
  generateQrDataUrl,
  generateQrSvg,
  saveQrImage,
};

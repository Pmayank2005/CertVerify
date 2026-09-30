/** Shared certificate client, owned by Angular's singleton WalletService. */
/** @returns {any} JavaScript workflow API consumed by the typed Angular services. */
function createCertificateClient({ ethers, CONFIG, CERTIFICATE_REGISTRY_ABI, createWalletSessionManager, QRCode, jsQR, onWalletState = (_state) => {}, onError = (_message) => {} }) {
const hooks = {};
const state = {
  provider: null,        // ethers Web3Provider (MetaMask)
  signer: null,          // ethers signer (connected account)
  contract: null,        // read-only contract (RPC provider)
  signerContract: null,  // read-write contract (MetaMask signer)
  account: null,         // connected account address
  chainId: null,
  walletSession: null,
  walletReady: false,
};

// ---------------------------------------------------------------------------
// Wallet connection (MetaMask)
// ---------------------------------------------------------------------------

/**
 * Connects to MetaMask and wires up signer + contract instances.
 * @returns {Promise<string>} the connected account address
 */
async function connectWallet() {
  const walletSession = state.walletSession || createWalletSession();
  const wasReady = state.walletReady;
  state.walletReady = false;
  try {
    const address = await walletSession.connectWallet();
    if (address && typeof hooks.onWalletConnected === "function") {
      await ensureCorrectNetwork();
    }
    state.walletReady = wasReady;
    if (address && wasReady && typeof hooks.onWalletConnected === "function") {
      await hooks.onWalletConnected();
    }
    return address;
  } catch (err) {
    state.walletReady = wasReady;
    throw err;
  }
}

/** Keeps the signer and UI synchronized with the shared wallet session. */
function syncWalletState(walletState) {
  const previousAddress = state.account;
  const previousChainId = state.chainId;
  state.account = walletState.address;
  state.chainId = walletState.chainId;

  if (state.account && window.ethereum) {
    state.provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    state.signer = state.provider.getSigner();
    state.signerContract = new ethers.Contract(
      CONFIG.CONTRACT_ADDRESS,
      CERTIFICATE_REGISTRY_ABI,
      state.signer
    );
  } else {
    state.provider = null;
    state.signer = null;
    state.signerContract = null;
  }

  updateTopbar();
  if (!state.walletReady) return;

  const accountChanged = previousAddress !== state.account;
  const connectedChainChanged = !!state.account && previousChainId !== state.chainId;
  if (!accountChanged && !connectedChainChanged) return;

  let hook = null;
  if (state.account && !previousAddress && typeof hooks.onWalletConnected === "function") {
    hook = hooks.onWalletConnected;
  } else if (typeof hooks.onAccountChanged === "function") {
    hook = hooks.onAccountChanged;
  }
  if (typeof hook === "function") {
    Promise.resolve(hook()).catch((err) => console.warn("[app] Wallet state refresh failed:", errorMessage(err)));
  }
}

function createWalletSession() {
  if (state.walletSession) return state.walletSession;
  state.walletSession = createWalletSessionManager({
    ethereum: window.ethereum,
    ethers,
    networkName: CONFIG.NETWORK_NAME,
    expectedChainId: CONFIG.CHAIN_ID,
    onStateChange: syncWalletState,
  });
  return state.walletSession;
}

/** Ensures MetaMask is connected to Ganache (chain ID 1337), switching or adding it if needed. */
async function ensureCorrectNetwork() {
  const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
  const expectedHex = "0x" + CONFIG.CHAIN_ID.toString(16);
  if (Number.parseInt(chainIdHex, 16) === CONFIG.CHAIN_ID) return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: expectedHex }],
    });
  } catch (err) {
    // 4902 = chain not added to MetaMask yet
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: expectedHex,
            chainName: CONFIG.NETWORK_NAME,
            rpcUrls: [CONFIG.RPC_URL],
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          },
        ],
      });
    } else {
      throw err;
    }
  }

  const activeChainId = await window.ethereum.request({ method: "eth_chainId" });
  state.walletSession?.handleChainChanged(activeChainId);
  if (Number.parseInt(activeChainId, 16) !== CONFIG.CHAIN_ID) throw new Error("Switch to the configured certificate network before submitting a transaction.");
}

// ---------------------------------------------------------------------------
// Contract helpers
// ---------------------------------------------------------------------------

/**
 * Creates a read-only contract instance that talks to Ganache directly.
 * Used by the verifier page so it works even without MetaMask.
 * (ethers v5 JsonRpcProvider does not enforce CORS itself, but Ganache
 * allows all origins by default.)
 */
function createReadonlyContract() {
  const provider = new ethers.providers.JsonRpcProvider(
    CONFIG.RPC_URL,
    { name: CONFIG.NETWORK_NAME, chainId: CONFIG.CHAIN_ID }
  );
  state.contract = new ethers.Contract(
    CONFIG.CONTRACT_ADDRESS,
    CERTIFICATE_REGISTRY_ABI,
    provider
  );
  return state.contract;
}

/** Which contract instance to use: signer-backed when connected, read-only otherwise. */
function getContract() {
  return state.signerContract || state.contract;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Converts a hex string (with or without 0x) into bytes32.
 * Left-pads with zeros if shorter than 32 bytes.
 * @param {string} hexStr
 * @returns {string} bytes32 hex string
 */
function toBytes32(hexStr) { // NOSONAR -- These utilities are intentionally scoped to the client instance API.
  let hex = hexStr.trim();
  if (hex.startsWith("0x") || hex.startsWith("0X")) hex = hex.slice(2);
  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error("Hash must be a hexadecimal string (0-9, a-f).");
  }
  if (hex.length > 64) {
    throw new Error("Hash is longer than 32 bytes (64 hex characters).");
  }
  if (!hex || /^0+$/.test(hex)) throw new Error("Enter a non-zero certificate hash.");
  return "0x" + hex.padStart(64, "0");
}

/** Maps contract status codes to a readable label. */
function statusLabel(statusCode) { // NOSONAR -- Keep public client helpers out of the global/module namespace.
  switch (Number(statusCode)) {
    case 0: return { text: "Not Found", css: "status-notfound" };
    case 1: return { text: "Valid", css: "status-valid" };
    case 2: return { text: "Revoked", css: "status-revoked" };
    default: return { text: "Unknown", css: "status-notfound" };
  }
}

/** Formats a unix timestamp (seconds) as a local date-time string. */
function formatTimestamp(seconds) { // NOSONAR -- Keep public client helpers out of the global/module namespace.
  const n = Number(seconds);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString();
}

/** Shortens an address/hash for display, e.g. 0x1234…abcd */
function shorten(value, start = 6, end = 4) { // NOSONAR -- Keep public client helpers out of the global/module namespace.
  if (!value) return "—";
  const s = String(value);
  if (s.length <= start + end + 2) return s;
  return `${s.slice(0, start + 2)}…${s.slice(-end)}`;
}

/** Extracts a human-readable message from an ethers/Ganache error. */
function errorMessage(err) { // NOSONAR -- Keep public client helpers out of the global/module namespace.
  if (!err) return "Unknown error";
  return (
    err.error?.message ||
    err.data?.message ||
    err.reason ||
    err.message ||
    String(err)
  ).replace("execution reverted: ", "");
}

/** Minimal metadata field extraction from the JSON stored on-chain. */
function parseMetadata(metadataJson) { // NOSONAR -- Keep public client helpers out of the global/module namespace.
  try {
    const metadata = JSON.parse(metadataJson);
    return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : { raw: metadataJson };
  } catch {
    return { raw: metadataJson };
  }
}

/** Escapes HTML special characters to prevent injection from metadata strings. */
function escapeHtml(text) { // NOSONAR -- Keep public client helpers out of the global/module namespace.
  return String(text ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

// ---------------------------------------------------------------------------
// Topbar / banner UI helpers (shared by all pages)
// ---------------------------------------------------------------------------

/** Shows a warning/error message in the page banner (or alerts as fallback). */
function showBanner(message) {
  const el = document.getElementById("banner");
  if (!el) {
    onError(message);
    return;
  }
  el.textContent = message;
  el.classList.add("show");
}

/** Hides the page banner. */
function hideBanner() { // NOSONAR -- Banner access belongs to this client instance.
  document.getElementById("banner")?.classList.remove("show");
}

function updateTopbar() { onWalletState(state.walletSession?.state); }

async function initWalletSession() {
  const session = createWalletSession();
  session.attachListeners();
  try {
    return await session.restoreWalletSession();
  } finally {
    state.walletReady = true;
    updateTopbar();
  }
}

// ---------------------------------------------------------------------------
// Phase 2 & 3 Helpers — Canonicalization, Hashing, QR & Off-chain Store
// ---------------------------------------------------------------------------

const CANONICAL_REQUIRED_FIELDS = [
  "studentName",
  "course",
  "institution",
  "dateOfCompletion",
];

const CANONICAL_FIELD_ORDER = new Set([
  "studentName",
  "course",
  "institution",
  "dateOfCompletion",
  "grade",
  "certificateId",
]);

function isMissingRequiredField(value) { // NOSONAR -- Canonicalization helpers form one private client unit.
  return !value || (typeof value === "string" && value.trim() === "");
}

function validateRequiredCertificateFields(data) {
  for (const field of CANONICAL_REQUIRED_FIELDS) {
    if (isMissingRequiredField(data[field])) {
      throw new Error(`Missing required field: "${field}"`);
    }
  }
}

function normalizeCertificateValue(value) { // NOSONAR -- Canonicalization helpers form one private client unit.
  return typeof value === "string" ? value.trim() : value;
}

function appendCanonicalFields(data, clean) {
  for (const key of CANONICAL_FIELD_ORDER) {
    if (data[key] !== null && data[key] !== undefined && key in data) {
      clean[key] = normalizeCertificateValue(data[key]);
    }
  }
}

function appendExtraFields(data, clean) {
  const extraEntries = Object.entries(data)
    .filter(([key, value]) => !CANONICAL_FIELD_ORDER.has(key) && value !== null && value !== undefined)
    .sort(([left], [right]) => {
      if (left < right) return -1;
      if (left > right) return 1;
      return 0;
    });

  for (const [key, value] of extraEntries) {
    clean[key] = normalizeCertificateValue(value);
  }
}

/**
 * Deterministically serializes certificate data in canonical order.
 */
function canonicalizeCertificate(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("Certificate data must be a non-null object");
  }

  validateRequiredCertificateFields(data);
  const clean = {};
  appendCanonicalFields(data, clean);
  appendExtraFields(data, clean);
  return JSON.stringify(clean);
}

/**
 * Computes deterministic 0x-prefixed SHA-256 hash using ethers.utils.sha256.
 */
function computeCertificateHash(data) {
  const canonicalJson = canonicalizeCertificate(data);
  return ethers.utils.sha256(ethers.utils.toUtf8Bytes(canonicalJson));
}

/**
 * Constructs verification URL for a given hash.
 */
function getVerificationUrl(hash) { // NOSONAR -- URL generation is part of the client instance API.
  const origin = window.location.origin || "";
  const pathname = "/verify";
  return `${origin}${pathname}?hash=${encodeURIComponent(hash)}`;
}

function getCertificateVerificationUrl(certificateId) { // NOSONAR -- URL generation is part of the client instance API.
  const origin = window.location.origin || "";
  const pathname = "/verify";
  return `${origin}${pathname}?id=${encodeURIComponent(certificateId)}`;
}

/**
 * Renders a QR code onto an HTML canvas element.
 */
async function renderQrCode(canvasEl, text, options = {}) {
  if (!QRCode) {
    console.error("QRCode library not loaded");
    return;
  }
  const opts = {
    width: options.width || 220,
    margin: options.margin !== undefined ? options.margin : 2,
    color: {
      dark: options.dark || "#0a0e17",
      light: options.light || "#ffffff",
    },
    errorCorrectionLevel: "M",
  };
  return new Promise((resolve, reject) => {
    QRCode.toCanvas(canvasEl, text, opts, (err) => {
      if (err) reject(err);
      else resolve(canvasEl);
    });
  });
}

/**
 * Fetches all certificates from off-chain store.
 */
async function fetchOffchainCertificates() { // NOSONAR -- Storage access is exposed through the client instance API.
  try {
    const res = await fetch("/data/certificates.json", { cache: "no-store" });
    if (!res.ok) return {};
    return await res.json();
  } catch (err) {
    console.warn("Could not fetch offchain certificates:", err);
    return {};
  }
}

/**
 * Fetches off-chain record for a specific hash.
 */
async function fetchOffchainCertificate(hash) {
  const all = await fetchOffchainCertificates();
  const normalized = (hash || "").toLowerCase();
  for (const [key, val] of Object.entries(all)) {
    if (key.toLowerCase() === normalized) {
      return val;
    }
  }
  return null;
}

/**
 * Saves a certificate record to the off-chain store via server API.
 */
async function storeCertificateOffchain(hash, data, txInfo = {}, recordInfo = {}) { // NOSONAR -- Storage access is exposed through the client instance API.
  try {
    const res = await fetch("/api/store-certificate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash, data, txInfo, recordInfo }),
    });
    if (!res.ok) {
      throw new Error(`Failed to store off-chain: ${res.statusText}`);
    }
    return await res.json();
  } catch (err) {
    console.warn("Could not store certificate off-chain via API:", err);
    return null;
  }
}

async function updateCertificateStatusOffchain(hash, status, txInfo = {}) { // NOSONAR -- Storage access is exposed through the client instance API.
  const response = await fetch("/api/update-certificate-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hash, status, txInfo }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `Failed to update certificate status (${response.status}).`);
  }
  return response.json();
}

/**
 * Decodes a QR code from an Image / Canvas / File using jsQR.
 */
async function decodeQrFromImage(imageSource) {
  if (!jsQR) {
    throw new Error("QR scanner engine (jsQR) is not loaded");
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  let img;
  if (imageSource instanceof HTMLImageElement) {
    img = imageSource;
  } else if (imageSource instanceof File || imageSource instanceof Blob) {
    img = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageSource);
    });
  } else {
    throw new TypeError("Unsupported image source for QR decoding");
  }

  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "dontInvert",
  });

  if (!code?.data) {
    const codeInverted = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "onlyInvert",
    });
    if (codeInverted?.data) return codeInverted.data;
    throw new Error("No readable QR code found in the image. Please make sure the QR code is clear.");
  }

  return code.data;
}

/**
 * Extracts certificate hash from decoded QR string (handles URLs or direct hashes).
 */
function extractHashFromQr(decodedText) { // NOSONAR -- QR parsing is exposed through the client instance API.
  if (!decodedText) return null;
  const trimmed = decodedText.trim();
  const queryStart = trimmed.indexOf("?");
  if (queryStart >= 0) {
    const query = trimmed.slice(queryStart + 1).split("#", 1)[0];
    const parameters = new URLSearchParams(query);
    const hashParam = parameters.get("hash");
    if (hashParam) return hashParam;
    const certificateId = parameters.get("id");
    if (certificateId) return certificateId;
  }

  const hexMatch = trimmed.match(/0x[a-fA-F0-9]{64}/);
  if (hexMatch) return hexMatch[0];

  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    return "0x" + trimmed;
  }

  return trimmed;
}

return { state, hooks, CONFIG, connectWallet, syncWalletState, createWalletSession, ensureCorrectNetwork, createReadonlyContract, getContract, toBytes32, statusLabel, formatTimestamp, shorten, errorMessage, parseMetadata, escapeHtml, showBanner, hideBanner, updateTopbar, initWalletSession, isMissingRequiredField, validateRequiredCertificateFields, normalizeCertificateValue, appendCanonicalFields, appendExtraFields, canonicalizeCertificate, computeCertificateHash, getVerificationUrl, getCertificateVerificationUrl, renderQrCode, fetchOffchainCertificates, fetchOffchainCertificate, storeCertificateOffchain, updateCertificateStatusOffchain, decodeQrFromImage, extractHashFromQr };
}
module.exports = { createCertificateClient };

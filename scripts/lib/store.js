/**
 * Off-Chain Certificate Data Store
 *
 * Manages the local JSON file that stores full certificate data, keyed by
 * the on-chain hash. The blockchain only stores the hash + metadata string;
 * this module stores the complete, human-readable certificate record.
 *
 * Storage file: data/certificates.json
 *
 * Usage:
 *   const store = require("./lib/store");
 *   store.save(hash, certData);
 *   const cert = store.get(hash);
 *   const all  = store.getAll();
 */

const fs = require("node:fs");
const path = require("node:path");

// Default storage path (project root / data / certificates.json)
const DEFAULT_STORE_PATH = path.join(__dirname, "..", "..", "data", "certificates.json");

/**
 * Ensures the store file and its parent directory exist.
 * Creates them if missing.
 *
 * @param {string} [storePath] - Path to the JSON store file
 */
function ensureStore(storePath = DEFAULT_STORE_PATH) {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify({}, null, 2), "utf8");
  }
}

/**
 * Loads the entire store from disk.
 *
 * @param {string} [storePath] - Path to the JSON store file
 * @returns {Object} The store contents (hash → certificate record)
 */
function load(storePath = DEFAULT_STORE_PATH) {
  ensureStore(storePath);
  const raw = fs.readFileSync(storePath, "utf8");
  return JSON.parse(raw);
}

/**
 * Writes the entire store to disk.
 *
 * @param {Object} storeData - The store contents
 * @param {string} [storePath] - Path to the JSON store file
 */
function write(storeData, storePath = DEFAULT_STORE_PATH) {
  ensureStore(storePath);
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(storeData, null, 2), "utf8");
    fs.renameSync(temporaryPath, storePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

/**
 * Saves a certificate record to the off-chain store.
 *
 * @param {string} hash - The certificate hash (0x-prefixed)
 * @param {Object} certData - The full certificate data object
 * @param {Object} [txInfo] - Optional on-chain transaction info
 * @param {string} [txInfo.txHash] - Transaction hash
 * @param {string} [txInfo.blockNumber] - Block number
 * @param {string} [txInfo.contractAddress] - Contract address
 * @param {string} [storePath] - Path to the JSON store file
 * @returns {Object} The saved record
 */
function save(hash, certData, txInfo = {}, storePathOrInfo = DEFAULT_STORE_PATH, recordInfoOrStorePath = {}) {
  let storePath = DEFAULT_STORE_PATH;
  let recordInfo = {};
  if (typeof storePathOrInfo === "string") {
    storePath = storePathOrInfo;
    recordInfo = typeof recordInfoOrStorePath === "object" ? recordInfoOrStorePath : {};
  } else {
    recordInfo = storePathOrInfo || {};
    if (typeof recordInfoOrStorePath === "string") storePath = recordInfoOrStorePath;
  }
  const store = load(storePath);
  if (Object.hasOwn(store, hash.toLowerCase())) throw Object.assign(new Error("A certificate with this hash is already stored."), { statusCode: 409 });
  const issuedAt = recordInfo.issuedAt || new Date().toISOString();

  const record = {
    hash,
    certificateId: recordInfo.certificateId || certData.certificateId || null,
    issueMethod: recordInfo.issueMethod || "direct-hash",
    documentHash: recordInfo.documentHash || hash,
    documentName: recordInfo.documentName || null,
    documentType: recordInfo.documentType || null,
    ipfsCid: recordInfo.ipfsCid || null,
    templateId: recordInfo.templateId || null,
    generation: recordInfo.generation || null,
    issuerAddress: recordInfo.issuerAddress || txInfo.issuerAddress || null,
    status: "valid",
    issuedAt,
    revokedAt: null,
    data: certData,
    storedAt: new Date().toISOString(),
    onChain: {
      txHash: txInfo.txHash || null,
      blockNumber: txInfo.blockNumber || null,
      contractAddress: txInfo.contractAddress || null,
      issuerAddress: txInfo.issuerAddress || recordInfo.issuerAddress || null,
      status: "valid",
    },
    history: [{ status: "valid", at: issuedAt, txHash: txInfo.txHash || null }],
  };

  store[hash.toLowerCase()] = record;
  write(store, storePath);
  return record;
}

function updateStatus(hash, status, txInfo = {}, storePath = DEFAULT_STORE_PATH) {
  if (status !== "revoked") throw new Error("Only irreversible revocation updates are supported.");
  const store = load(storePath);
  const record = store[hash.toLowerCase()];
  if (!record) return null;
  if (record.status === "revoked") return record;

  const revokedAt = txInfo.revokedAt || new Date().toISOString();
  record.status = "revoked";
  record.revokedAt = revokedAt;
  record.onChain = {
    ...record.onChain,
    status: "revoked",
    revokeTxHash: txInfo.txHash || null,
    revokeBlockNumber: txInfo.blockNumber || null,
  };
  record.history = [...(record.history || []), { status: "revoked", at: revokedAt, txHash: txInfo.txHash || null }];
  write(store, storePath);
  return record;
}

/**
 * Retrieves a certificate record by hash.
 *
 * @param {string} hash - The certificate hash (0x-prefixed)
 * @param {string} [storePath] - Path to the JSON store file
 * @returns {Object|null} The certificate record, or null if not found
 */
function get(hash, storePath = DEFAULT_STORE_PATH) {
  const store = load(storePath);
  return store[hash.toLowerCase()] || null;
}

/**
 * Returns all stored certificate records.
 *
 * @param {string} [storePath] - Path to the JSON store file
 * @returns {Object} All records (hash → certificate record)
 */
function getAll(storePath = DEFAULT_STORE_PATH) {
  return load(storePath);
}

/**
 * Checks if a certificate exists in the off-chain store.
 *
 * @param {string} hash - The certificate hash (0x-prefixed)
 * @param {string} [storePath] - Path to the JSON store file
 * @returns {boolean}
 */
function exists(hash, storePath = DEFAULT_STORE_PATH) {
  const store = load(storePath);
  return hash.toLowerCase() in store;
}

/**
 * Returns the number of stored certificates.
 *
 * @param {string} [storePath] - Path to the JSON store file
 * @returns {number}
 */
function count(storePath = DEFAULT_STORE_PATH) {
  const store = load(storePath);
  return Object.keys(store).length;
}

/**
 * Removes a certificate from the off-chain store (does NOT affect on-chain data).
 *
 * @param {string} hash - The certificate hash (0x-prefixed)
 * @param {string} [storePath] - Path to the JSON store file
 * @returns {boolean} true if the record was found and removed
 */
function remove(hash, storePath = DEFAULT_STORE_PATH) {
  const store = load(storePath);
  const key = hash.toLowerCase();
  if (key in store) {
    delete store[key];
    write(store, storePath);
    return true;
  }
  return false;
}

module.exports = {
  save,
  updateStatus,
  get,
  getAll,
  exists,
  count,
  remove,
  load,
  ensureStore,
  DEFAULT_STORE_PATH,
};

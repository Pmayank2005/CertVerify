/**
 * Deterministic SHA-256 Certificate Hashing Module
 *
 * Takes certificate data fields and produces a deterministic SHA-256 hash.
 * The same input always produces the same hash — regardless of property
 * insertion order — by canonicalizing the data before hashing.
 *
 * Usage:
 *   const { hashCertificate, canonicalize } = require("./lib/hash");
 *   const hash = hashCertificate({ studentName: "Alice", course: "CS101", ... });
 */

const crypto = require("crypto");

// ──────────────────────────────────────────────────────────────────────────────
// Required fields for a valid certificate (enforced at hash-time)
// ──────────────────────────────────────────────────────────────────────────────
const REQUIRED_FIELDS = [
  "studentName",
  "course",
  "institution",
  "dateOfCompletion",
];

// ──────────────────────────────────────────────────────────────────────────────
// Canonical field order — controls the exact byte sequence that gets hashed.
// Any extra fields are appended in sorted order after the canonical ones.
// ──────────────────────────────────────────────────────────────────────────────
const CANONICAL_ORDER = [
  "studentName",
  "course",
  "institution",
  "dateOfCompletion",
  "grade",
  "certificateId",
];

/**
 * Canonicalizes a certificate data object into a deterministic JSON string.
 *
 * 1. Trims all string values.
 * 2. Orders keys: CANONICAL_ORDER first, then any remaining keys in
 *    lexicographic (sorted) order.
 * 3. Produces the same JSON string regardless of the original key order.
 *
 * @param {Object} data - Certificate data fields
 * @returns {string} Canonical JSON string
 * @throws {Error} If a required field is missing or empty
 */
function canonicalize(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Certificate data must be a non-null object");
  }

  // Validate required fields
  for (const field of REQUIRED_FIELDS) {
    if (!data[field] || (typeof data[field] === "string" && data[field].trim() === "")) {
      throw new Error(`Missing required field: "${field}"`);
    }
  }

  // Build the ordered object
  const ordered = {};

  // 1. Canonical fields first (in defined order), if present
  for (const key of CANONICAL_ORDER) {
    if (data[key] !== undefined && data[key] !== null) {
      ordered[key] = typeof data[key] === "string" ? data[key].trim() : data[key];
    }
  }

  // 2. Any remaining keys in sorted order
  const extraKeys = Object.keys(data)
    .filter((k) => !CANONICAL_ORDER.includes(k))
    .sort();

  for (const key of extraKeys) {
    if (data[key] !== undefined && data[key] !== null) {
      ordered[key] = typeof data[key] === "string" ? data[key].trim() : data[key];
    }
  }

  return JSON.stringify(ordered);
}

/**
 * Produces a SHA-256 hash of the canonical certificate data.
 *
 * @param {Object} data - Certificate data fields
 * @returns {string} The SHA-256 hash as a 0x-prefixed hex string (bytes32-compatible)
 * @throws {Error} If data is invalid or missing required fields
 */
function hashCertificate(data) {
  const canonical = canonicalize(data);
  const hash = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  return "0x" + hash;
}

/**
 * Verifies that a given hash matches the certificate data.
 *
 * @param {string} hash - Expected hash (0x-prefixed hex string)
 * @param {Object} data - Certificate data to verify
 * @returns {boolean} true if the hash matches
 */
function verifyHash(hash, data) {
  const computed = hashCertificate(data);
  return computed.toLowerCase() === hash.toLowerCase();
}

module.exports = {
  hashCertificate,
  canonicalize,
  verifyHash,
  REQUIRED_FIELDS,
  CANONICAL_ORDER,
};

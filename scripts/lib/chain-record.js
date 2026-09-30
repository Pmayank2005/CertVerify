const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const { hashCertificate } = require("./hash");
const { isDeepStrictEqual } = require("node:util");

const ABI = [
  "function getCertificateStatus(bytes32) view returns (uint8)",
  "function getCertificate(bytes32) view returns (tuple(bytes32 hash,address issuedBy,uint256 issuedAt,string metadata,uint8 status))",
  "event CertificateIssued(bytes32 indexed hash,address indexed issuedBy,uint256 timestamp,string metadata)",
  "event CertificateRevoked(bytes32 indexed hash,address indexed revokedBy,uint256 timestamp)",
];

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// A client assertion that a transaction succeeded is not sufficient to mutate
// the local registry. Check its mined event against the configured deployment.
async function verifyRecordTransaction(payload, revoke = false, connection) {
  if (!/^0x[0-9a-f]{64}$/i.test(payload.txInfo?.txHash || "")) throw invalid("A confirmed transaction hash is required.");
  if (!connection) {
    const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, "../../deployments/CertificateRegistry-ganache.json"), "utf8"));
    const provider = new ethers.providers.JsonRpcProvider({ url: process.env.GANACHE_RPC_URL || "http://127.0.0.1:8545", timeout: 10000 });
    connection = { provider, contract: new ethers.Contract(deployment.contractAddress, ABI, provider) };
  }
  const { provider, contract } = connection;
  const receipt = await provider.getTransactionReceipt(payload.txInfo.txHash);
  if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== contract.address.toLowerCase()) {
    throw invalid("Transaction is not a successful call to the configured certificate registry.");
  }
  const eventName = revoke ? "CertificateRevoked" : "CertificateIssued";
  const event = receipt.logs.filter((log) => log.address.toLowerCase() === contract.address.toLowerCase()).map((log) => {
    try { return contract.interface.parseLog(log); } catch { return null; }
  }).find((log) => log?.name === eventName && log.args.hash.toLowerCase() === payload.hash.toLowerCase());
  if (!event) throw invalid(`Transaction does not contain the expected ${eventName} event.`);
  const status = Number(await contract.getCertificateStatus(payload.hash));
  if (revoke ? status !== 2 : status !== 1) throw invalid("Requested status does not match the blockchain.");
  const block = await provider.getBlock(receipt.blockNumber);
  const at = new Date(block.timestamp * 1000).toISOString();
  const txInfo = { txHash: receipt.transactionHash, blockNumber: receipt.blockNumber, contractAddress: contract.address, issuerAddress: receipt.from, revokedAt: at };
  if (revoke) return { txInfo };

  const certificate = await contract.getCertificate(payload.hash);
  let metadata;
  try { metadata = JSON.parse(certificate.metadata); } catch { metadata = { raw: certificate.metadata }; }
  const recordInfo = payload.recordInfo || {};
  if (["pdf", "raw-data"].includes(metadata?.issueMethod)) {
    if (metadata.certificateId !== recordInfo.certificateId || metadata.certificateId !== payload.data.certificateId || metadata.documentHash?.toLowerCase() !== payload.hash.toLowerCase() || metadata.issueMethod !== recordInfo.issueMethod || (metadata.templateId || null) !== (recordInfo.templateId || null)) {
      throw invalid("Certificate identity does not match its on-chain metadata.");
    }
    if (!metadata.metadataHash || hashCertificate(payload.data).toLowerCase() !== metadata.metadataHash.toLowerCase()) {
      throw invalid("Certificate metadata is not anchored by this transaction.");
    }
  } else {
    let dataMatchesHash = false;
    try { dataMatchesHash = hashCertificate(payload.data).toLowerCase() === payload.hash.toLowerCase(); } catch { /* Direct registration may not use the canonical data schema. */ }
    if (!dataMatchesHash && !isDeepStrictEqual(payload.data, metadata)) throw invalid("Certificate data does not match the blockchain record.");
    recordInfo.issueMethod = "direct-hash";
    recordInfo.certificateId = payload.data.certificateId || null;
    recordInfo.templateId = null;
    recordInfo.documentHash = payload.hash;
  }
  return { txInfo, recordInfo: { ...recordInfo, status: "valid", issuerAddress: certificate.issuedBy, issuedAt: at } };
}

module.exports = { verifyRecordTransaction };

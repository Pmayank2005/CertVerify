/**
 * CertificateRegistry ABI (browser-readable copy of
 * artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json)
 *
 * Keep in sync with contracts/CertificateRegistry.sol — if the contract
 * changes, recompile and refresh this ABI.
 */
const CERTIFICATE_REGISTRY_ABI = [
  "constructor(address _issuer)",
  "event CertificateIssued(bytes32 indexed hash, address indexed issuedBy, uint256 timestamp, string metadata)",
  "event CertificateRevoked(bytes32 indexed hash, address indexed revokedBy, uint256 timestamp)",
  "event IssuerChanged(address indexed previousIssuer, address indexed newIssuer)",
  "function certificates(bytes32) view returns (bytes32 hash, address issuedBy, uint256 issuedAt, string metadata, uint8 status)",
  "function changeIssuer(address _newIssuer)",
  "function getCertificate(bytes32 _hash) view returns (tuple(bytes32 hash, address issuedBy, uint256 issuedAt, string metadata, uint8 status))",
  "function getCertificateStatus(bytes32 _hash) view returns (uint8)",
  "function getIssuedHashByIndex(uint256 _index) view returns (bytes32)",
  "function getTotalIssuedCount() view returns (uint256)",
  "function isCertificateValid(bytes32 _hash) view returns (bool)",
  "function issueCertificate(bytes32 _hash, string _metadata)",
  "function issuedHashes(uint256) view returns (bytes32)",
  "function issuer() view returns (address)",
  "function revokeCertificate(bytes32 _hash)",
];

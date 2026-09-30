// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title CertificateRegistry
 * @dev A smart contract for issuing, storing, and verifying academic certificates on the blockchain.
 *
 * This contract maintains a registry of certificate hashes and their statuses.
 * Only the authorized issuer can issue or revoke certificates.
 * The actual certificate data is stored off-chain and referenced by its SHA-256 hash.
 *
 * Status:
 *   0 = Not Found
 *   1 = Valid
 *   2 = Revoked
 */
contract CertificateRegistry {

    // ============ State Variables ============

    /// @dev The address of the authorized certificate issuer
    address public issuer;

    /// @dev Mapping from certificate hash to certificate details
    mapping(bytes32 => Certificate) public certificates;

    /// @dev Array of all issued certificate hashes (for tracking purposes)
    bytes32[] public issuedHashes;

    // ============ Structures ============

    /// @dev Represents a certificate stored in the registry
    struct Certificate {
        bytes32 hash;                    // SHA-256 hash of the certificate data
        address issuedBy;                // Address of the issuer
        uint256 issuedAt;                // Timestamp of issuance
        string metadata;                 // JSON metadata (student name, course, etc.)
        CertificateStatus status;        // Current status (Valid, Revoked, etc.)
    }

    /// @dev Status of a certificate
    enum CertificateStatus { Valid, Revoked }

    // ============ Events ============

    /// @dev Emitted when a new certificate is issued
    event CertificateIssued(
        bytes32 indexed hash,
        address indexed issuedBy,
        uint256 timestamp,
        string metadata
    );

    /// @dev Emitted when a certificate is revoked
    event CertificateRevoked(
        bytes32 indexed hash,
        address indexed revokedBy,
        uint256 timestamp
    );

    /// @dev Emitted when the issuer is changed
    event IssuerChanged(
        address indexed previousIssuer,
        address indexed newIssuer
    );

    // ============ Modifiers ============

    /// @dev Restricts function access to the authorized issuer only
    modifier onlyIssuer() {
        require(msg.sender == issuer, "Only the issuer can call this function");
        _;
    }

    /// @dev Ensures the certificate hash is not zero
    modifier validHash(bytes32 _hash) {
        require(_hash != bytes32(0), "Certificate hash cannot be zero");
        _;
    }

    // ============ Constructor ============

    /// @dev Initializes the contract with the issuer address
    /// @param _issuer The address authorized to issue and revoke certificates
    constructor(address _issuer) {
        require(_issuer != address(0), "Issuer address cannot be zero");
        issuer = _issuer;
    }

    // ============ Core Functions ============

    /**
     * @dev Issues a new certificate
     * @param _hash The SHA-256 hash of the certificate data
     * @param _metadata JSON string containing certificate metadata
     *
     * Requirements:
     * - Caller must be the authorized issuer
     * - Hash must not be zero
     * - Certificate with this hash must not already exist
     *
     * Emits: CertificateIssued event
     */
    function issueCertificate(
        bytes32 _hash,
        string memory _metadata
    ) public onlyIssuer validHash(_hash) {
        require(
            certificates[_hash].hash == bytes32(0),
            "Certificate with this hash already exists"
        );

        certificates[_hash] = Certificate({
            hash: _hash,
            issuedBy: msg.sender,
            issuedAt: block.timestamp,
            metadata: _metadata,
            status: CertificateStatus.Valid
        });

        issuedHashes.push(_hash);

        emit CertificateIssued(_hash, msg.sender, block.timestamp, _metadata);
    }

    /**
     * @dev Retrieves certificate details by hash
     * @param _hash The SHA-256 hash of the certificate
     * @return The Certificate struct containing all details
     *
     * Returns:
     * - hash: The certificate hash
     * - issuedBy: Address of the issuer
     * - issuedAt: Timestamp of issuance
     * - metadata: JSON metadata
     * - status: Current status (Valid or Revoked)
     */
    function getCertificate(bytes32 _hash)
        public
        view
        validHash(_hash)
        returns (Certificate memory)
    {
        return certificates[_hash];
    }

    /**
     * @dev Checks if a certificate is valid
     * @param _hash The SHA-256 hash of the certificate
     * @return true if the certificate exists and is valid, false otherwise
     */
    function isCertificateValid(bytes32 _hash)
        public
        view
        validHash(_hash)
        returns (bool)
    {
        Certificate memory cert = certificates[_hash];
        return cert.hash != bytes32(0) && cert.status == CertificateStatus.Valid;
    }

    /**
     * @dev Gets the status of a certificate
     * @param _hash The SHA-256 hash of the certificate
     * @return 0 if not found, 1 if valid, 2 if revoked
     */
    function getCertificateStatus(bytes32 _hash)
        public
        view
        validHash(_hash)
        returns (uint8)
    {
        Certificate memory cert = certificates[_hash];

        if (cert.hash == bytes32(0)) {
            return 0; // Not Found
        } else if (cert.status == CertificateStatus.Valid) {
            return 1; // Valid
        } else {
            return 2; // Revoked
        }
    }

    /**
     * @dev Revokes an existing certificate
     * @param _hash The SHA-256 hash of the certificate to revoke
     *
     * Requirements:
     * - Caller must be the authorized issuer
     * - Hash must not be zero
     * - Certificate must exist
     * - Certificate must not already be revoked
     *
     * Emits: CertificateRevoked event
     */
    function revokeCertificate(bytes32 _hash)
        public
        onlyIssuer
        validHash(_hash)
    {
        Certificate storage cert = certificates[_hash];

        require(
            cert.hash != bytes32(0),
            "Certificate does not exist"
        );
        require(
            cert.status == CertificateStatus.Valid,
            "Certificate is already revoked"
        );

        cert.status = CertificateStatus.Revoked;

        emit CertificateRevoked(_hash, msg.sender, block.timestamp);
    }

    /**
     * @dev Changes the authorized issuer
     * @param _newIssuer The address of the new issuer
     *
     * Requirements:
     * - Caller must be the current issuer
     * - New issuer address cannot be zero
     *
     * Emits: IssuerChanged event
     */
    function changeIssuer(address _newIssuer) public onlyIssuer {
        require(_newIssuer != address(0), "New issuer address cannot be zero");

        address previousIssuer = issuer;
        issuer = _newIssuer;

        emit IssuerChanged(previousIssuer, _newIssuer);
    }

    // ============ View Functions ============

    /**
     * @dev Returns the total number of issued certificates
     * @return The count of all certificate hashes in the registry
     */
    function getTotalIssuedCount() public view returns (uint256) {
        return issuedHashes.length;
    }

    /**
     * @dev Returns a certificate hash by index
     * @param _index The index in the issuedHashes array
     * @return The certificate hash at the given index
     */
    function getIssuedHashByIndex(uint256 _index)
        public
        view
        returns (bytes32)
    {
        require(_index < issuedHashes.length, "Index out of bounds");
        return issuedHashes[_index];
    }
}

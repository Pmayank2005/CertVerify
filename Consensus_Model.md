# Consensus and trust model

## Implemented demonstration

CertVerify runs on a single Ganache development node. It does not implement a distributed consensus network, validator voting, or consortium governance.

`CertificateRegistry.sol` authorizes one issuer address. That address can issue and revoke certificates and transfer issuer authority. Other accounts can query certificate status. Contract authorization decides who may change registry records; it is separate from the blockchain's consensus mechanism.

The contract stores hashes, issuer addresses, timestamps, metadata, and certificate status. The local JSON store supports record display and certificate-ID lookup. The storage API validates confirmed registry transactions before accepting writes. Verification still depends on querying the intended chain and deployment.

## Proposed consortium extension

A consortium could operate a permissioned Ethereum-compatible network with validators managed by participating institutions. This is an architectural proposal, not a deployable configuration included in this repository.

One candidate is QBFT, a Byzantine fault tolerant proof-of-authority protocol. QBFT provides immediate finality under its fault and network assumptions; these guarantees should not be generalized to every PoA protocol. Its fault bound is fewer than one third of validators. See the [QBFT specification](https://entethalliance.org/specs/qbft/v1/) and [Besu QBFT documentation](https://github.com/besu-eth/besu-docs/blob/main/docs/private-networks/how-to/configure/consensus/qbft.md).

For example, a four-validator network can tolerate one faulty validator under the protocol assumptions. Validators participate in block agreement; certificate issuers submit application transactions. An institution's issuer role need not grant it a validator role.

## Work required before a consortium deployment

- Define validator membership, voting, removal, and recovery procedures.
- Configure and operate multiple nodes with protected keys, monitored RPC endpoints, and backups.
- Decide whether each institution has its own registry or whether the contract needs multiple authorized issuers.
- Replace local JSON storage with durable shared storage and define access controls for personal data.
- Provide stable verification URLs and reliable read access to the intended chain.
- Test failure recovery, issuer changes, revocation, data retention, and contract upgrades.

No throughput, availability, or production security guarantees have been measured for this proposal. The working local setup remains the one described in [Local_Connection.md](Local_Connection.md).

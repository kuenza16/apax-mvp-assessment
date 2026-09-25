# APAX blockchain assessment — Phase 4

## Existing repository

`APAXToken.sol` uses Solidity ^0.8.24 and OpenZeppelin 5.6.1 (locked), with
Hardhat's Solidity 0.8.28 compiler. It is an ERC-20 named APAX Token / APAX,
with 18 decimals and a fixed initial supply of one million tokens. Ownable gives
one owner allowlist control. The constructor approves the owner before minting;
`_update` checks both nonzero endpoints, including `transferFrom`. Spenders
themselves are not checked. Ownership transfer does not automatically approve the
new owner. No external mint, burn, pause, or distinct operational roles exist.

The existing Mocha/Chai/ethers tests run through Hardhat 3. The deployment script
and Ignition module both instantiate APAXToken with the first signer as owner.
Neither was run. `shared/constants.ts` (there is no constants directory) records
Sepolia chain ID 11155111 and a token address; this assessment does not verify any
live deployment. The shared APAXToken ABI is checked against the locally compiled
artifact: all 34 ABI entries match. It describes the old token, not APXGold.

`web/src/services/blockchain.ts` instead declares `getBalance`, `Deposited`, and
`Withdrawn`, none of which APAXToken implements. Its provider-only contract is
not a minting signer. This legacy service is not an APXGold integration; it and
the working Phase 3 holdings flow remain unchanged.

## Scope and standard choice

A separate `APXGold.sol` provides a small ERC-20 with compliance gates, easier to
review and appropriate for demonstrating the assessment requirements. No existing
identity registry or meaningful ERC-3643 infrastructure was found.
[ERC-3643](https://ercs.ethereum.org/ERCS/erc-3643) defines a substantially broader
identity and compliance architecture, including identity, issuer and claim-topic
registries. That architecture is a stronger basis to evaluate for mature regulated
tokenization, but implementing and integrating it would exceed this assessment.
This contract is not ERC-3643 compliant or proof of regulatory compliance.
Production APAX may require a complete permissioned-token architecture.

## Contract and roles

APX-Gold / APXG starts with zero supply and 18 decimals. Decimal precision does
not establish grams, purity, custody, redemption rights, or a legally enforceable
unit of gold. Those terms must be defined separately before issuance.

OpenZeppelin ERC20Pausable supplies standard token accounting and the pause hook;
AccessControl supplies grants, revocations, and role checks. The implementation
follows the [OpenZeppelin ERC-20 API](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20).

| Role | Authority |
| --- | --- |
| DEFAULT_ADMIN_ROLE | Assigned to the nonzero constructor admin; manages all roles, compliance authorization and pause/unpause. |
| MINTER_ROLE | Calls `mint(to, amount)` after off-chain approvals. Not automatically granted to admin. |
| REDEEMER_ROLE | Calls `burnFrom(holder, amount)` using the holder's ERC-20 allowance. Not automatically granted to admin or minter. |

Admin is ultimately trusted and can grant itself operational roles. Losing or
renouncing the final admin can permanently strand administration. Production
should evaluate multisig control, delayed/two-step admin transfer and separation
of duties. This minimal contract has no upgrade proxy, forced transfer or recovery.

## Compliance and pause semantics

`setApproved(account, bool)` is admin-only, rejects zero, and emits
`ComplianceUpdated`. Repeating the same setting is permitted. Revocation affects
future operations; it does not destroy an existing balance.

| Operation | Unpaused requirements |
| --- | --- |
| Mint (zero → holder) | MINTER_ROLE caller; approved, nonzero recipient. |
| Transfer (holder → holder) | Both endpoints approved. |
| transferFrom | Both endpoints and caller approved, plus sufficient allowance. |
| Burn (holder → zero) | REDEEMER_ROLE caller; approved, nonzero holder; sufficient balance and allowance to caller. |

Zero is exempt only as an internal mint/burn endpoint and cannot be allowlisted.
Minter/redeemer authorization is role-based: these operators do not need holder
approval for their role operation. An operator using `transferFrom` does.
There is no public self-burn shortcut or admin confiscation function.

Pause conservatively blocks **all transfers, minting and burning**, through the
common `_update` hook. Allowance updates remain possible, including cancellation
while paused or revoked; role/compliance administration and reads also remain
available. Approving a spender grants no exemption from execution-time checks.
Reverts roll back allowance spending as well as balance changes. Standard ERC-20
zero-amount and infinite-allowance behavior is retained. Use exact redemption
allowances; an unlimited allowance gives a compromised redeemer excessive power.

## Mint and redemption lifecycle

Intended mint sequence: physical gold deposited → custodian verifies receipt and
quality → compliance approval → authorized APAX service validates an issuance
record → MINTER_ROLE transaction → confirmed mint. The contract proves only
token issuance, **not that physical gold exists**. It has no reserve oracle, cap,
issuance-reference deduplication or custody integration.

Intended redemption sequence: request → authenticated backend user → verified
wallet ownership and compliance/identity checks → chain balance check → durable
redemption record → custody/operations settlement approval → exact holder
allowance → authorized burn → confirm burn on-chain → physical release process.
JWT login alone does not establish ownership of a wallet. Balances and allowances
must be rechecked at execution; a prior API check cannot reserve tokens.

Burning before operational approval irreversibly removes tokens even if gold
cannot be released. Approval reduces that risk but does not make physical delivery
atomic with blockchain execution. Failed settlement after a confirmed burn needs
an audited exception/reconciliation process and carefully approved compensation,
not automatic reminting or an assertion that a MongoDB status proves delivery.
This contract supplies only the burn primitive, not a complete redemption system.

## Major unresolved risks

| Risk | Production treatment to evaluate |
| --- | --- |
| Compromised admin | Multisig, delayed sensitive changes, monitoring; admin can authorize malicious roles and freeze holders. |
| Compromised minter | Restricted signing service/HSM, issuance limits, dual approval, rapid revocation; role can mint unlimited supply to approved accounts. |
| Incorrect compliance authorization | Verified identity-to-wallet binding, policy review and auditable approvals; a boolean is not KYC. |
| Custody/supply mismatch and double mint | Independent custody reconciliation, unique issuance references and idempotent workflows; duplicate transactions can still mint twice here. |
| Redemption races/replays | Durable state transitions, unique requests, transaction/nonce tracking, exact consent, and execution-time checks; no on-chain redemption request ID exists here. |
| Early burn or failed settlement | Approve settlement before burn; confirm finality before release; documented exception handling after irreversible burn. |
| Admin/upgrade centralization | No proxy here; privileged administration remains centralized. Future upgrades need governance, review and storage/security audits. |
| Future price/reserve oracle manipulation | Independent inputs, freshness/deviation checks and circuit breakers; no oracle or reserve attestation implemented. |
| Event/indexer lag or reorg | Confirmation policy, block-hash checkpoints, replay and rollback; distinguish pending from finalized state. |
| UI trusts MongoDB over chain | Chain balances authoritative for token operations; surface read-model lag and chain/contract identity. |
| Private keys | Never browser bundles, repo, logs or general database plaintext; isolated signing, hardware-backed custody, rotation and least privilege. No real keys used here. |

Allowance changes also have standard ERC-20 transaction-ordering risks. Prefer
exact consent and zeroing an old allowance before changing it, without claiming
that this prevents an already-authorized transaction from executing first.
None of these operational risks is completely solved by this contract.

## Future Next.js balance and allowance reads

Use the existing ethers v6 direction: wallet address → read-only public EVM
provider → the correct chain's APXGold address and generated ABI →
`balanceOf(wallet)` and `allowance(wallet, spender)`. No private key is needed
for these reads. A future wagmi public client could perform equivalent reads.

```ts
// Conceptual integration only; addresses/provider must be configured and verified.
const token = new ethers.Contract(tokenAddress, apxGoldAbi.abi, publicProvider);
const blockTag = await publicProvider.getBlockNumber();
const [balance, allowance, decimals] = await Promise.all([
  token.balanceOf(walletAddress, { blockTag }),
  token.allowance(walletAddress, spenderAddress, { blockTag }),
  token.decimals({ blockTag }),
]);
const displayBalance = ethers.formatUnits(balance, decimals);
```

Validate chain ID and contract address; keep amounts as bigint rather than JS
floating-point numbers. Refresh when account, chain, relevant confirmations or
allowances change; handle disconnect/loading/error explicitly. An allowance is
spender-specific authorization, not a guarantee of transfer or redemption: roles,
compliance, pause and balances still apply. Use a wallet signer only for approved
future transactions; none is wired in this phase.

Phase 3's authenticated MongoDB holdings API remains intact. It models application
holdings at the current assessment stage, not confirmed APXGold balances, reserves
or wallet ownership. Do not replace it silently or combine the two as if identical.

## Source of truth and indexing

Blockchain state is authoritative for Transfer events, mint/burn, receipts,
confirmation depth and token balances. ERC-20 `Transfer` from zero denotes mint;
to zero denotes burn. MongoDB stores profiles, compliance workflow, redemption
records, transaction metadata and indexed read models; it must not invent
confirmed on-chain balances. Physical custody remains independently evidenced.

Production indexing: contract event → indexer → required confirmations →
idempotent processing → MongoDB read model → API/UI. Key events by chain ID,
contract, transaction hash and log index; store block hash/number and a durable
checkpoint. Apply event and checkpoint changes atomically, backfill on restart,
and reconcile against `balanceOf` at a known block. Track canonical block hashes,
rewind/undo orphaned events and replay after reorgs. Finality requirements must be
chain-appropriate. OpenZeppelin allowance spending need not emit Approval, so
Approval logs alone cannot reconstruct current allowance; read it from chain.
No full indexer was added.

## Local verification and limitations

Run `npm.cmd ci --ignore-scripts` then `npm.cmd test` from `smart-contracts/`.
The test script selects `hardhatMainnet`, an in-memory simulated L1, not Ethereum
mainnet. Test fixtures instantiate contracts only inside that simulation; no
deployment script, remote network, real wallet, key, RPC credential or funds is used.
Hardhat may download its pinned compiler on the first run.

Remote network settings now use lazy Hardhat config variables and no automatic
dotenv loading, so local testing needs no remote secrets. Existing remote scripts
remain unchanged and were not invoked. Shared APXGold ABI is generated from the
compiled local artifact for review; no deployed APXGold address is assigned.
The pre-existing top-level `etherscan` configuration was also corrected to
Hardhat 3's typed `verify.etherscan.apiKey` shape. Remote use now requires explicit
environment/config-variable provisioning; `.env` is not automatically loaded.

Tests cover metadata, roles, zero addresses, minting, both transfer endpoints,
delegated operators, revocation, pause, consented burns, rejected burns and atomic
allowance rollback. Existing token and application regression suites also run.
This is an unaudited assessment: no production custody, identity provider, oracle,
proxy, bridge, DAO, staking, deployment or physical redemption implementation.

### Phase 4 checkpoint results (2026-09-25)

Phase 5 reran all suites; authentication now has 21 tests after registration and
startup fixes. See [final review](APAX_FINAL_REVIEW.md) for final counts and caveats.

| Check | Result |
| --- | --- |
| Smart-contract suite | 42 passed: 23 APAXToken + 19 APXGold |
| Backend authentication | 18 passed |
| Backend holdings | 20 passed |
| Frontend/session | 8 passed |
| TypeScript | Web and smart-contracts passed |
| Lint | Web ESLint passed; no separate Solidity lint setup exists |
| Existing shared ABI | All 34 entries match compiled APAXToken |
| Git whitespace check | Passed |

`npm ci --ignore-scripts` reported 21 audit findings in the existing locked
contract dependencies (12 low, 3 moderate, 6 high). No dependency versions were
changed and no automated audit fix was applied; dependency review remains pending.
Hardhat reports `network.connect()` deprecated; tests retain the repository's
existing testing style. Passing tests are not a security audit.

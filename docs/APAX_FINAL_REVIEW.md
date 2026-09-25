# APAX final review and submission preparation

Reviewed locally on 2026-09-25, branch `apax/kuenzang-sangay`, against the current
Git HEAD/original tracked files plus every untracked assessment file. No staging,
commit, push, history rewrite, deployment or remote blockchain operation occurred.

## Readiness and questionable items first

**Technically ready to commit as a scoped assessment, with the limitations below
disclosed. Not production-ready.** All 91 automated tests pass. A fresh interactive
browser pass could not be performed in Phase 5 because browser discovery returned
no available browser. Previous Phase 3 browser results are historical evidence,
not a new Phase 5 pass. No existing files were automatically deleted in this review.

| Priority | Finding / disposition |
| --- | --- |
| Critical historical | Import-time remote JavaScript execution was removed in Phase 1 and remains absent from application source. The old configuration is deleted in the working tree but still exists in Git history. No old endpoint was contacted. Removal does not establish whether previous execution compromised a machine. |
| High, operational | `web/.env` contains private runtime configuration and is ignored. The database credential appeared in earlier session diagnostics; its owner should rotate it. No credential values are reproduced here. Rotation is not verified. |
| High, before production | Existing locked contract tooling reported 21 npm audit findings during Phase 4 installation: 12 low, 3 moderate, 6 high. No dependency upgrades were authorized/applied in this review; web dependency security is not certified by this count. |
| High, before production | No rate limiting, strict CORS policy, server JWT revocation, full recovery hardening or production custody controls. Public demo activity/balance endpoints are not an authenticated ledger. |
| Runtime issue, fixed | Clean registration without avatar returned 500 because Cloudinary upload was unconditional. It now validates input and skips the optional upload; real database/HTTP tests cover creation, login, safe response, empty holdings, duplicate account and invalid input. |
| Runtime issue, fixed | Express 5 can invoke its listen callback on error. Startup previously printed success before a port conflict. Success is now logged only on the listening event; an occupied-port regression test passes. |
| Documentation, fixed | README previously directed npm commands to the repository root and omitted contract instructions; corrected. Phase 1/baseline reports now explicitly distinguish historical findings from final behavior. |
| Hygiene, fixed | Optional service-looking values in `config.env.example` were inherited from the original repository and had uncertain provenance. They are now blank. Narrow ignore rules cover review artifacts, logs and known test-database export directories. |
| Minor, retained | Hardhat warns `network.connect()` is deprecated. Existing mixed formatting and duplicated UI calculations/hooks remain. Unused historical packages and optional provider settings were not broadly removed. |
| Verification limitation | Phase 5 HTTP/session tests are current; interactive UI redirect/render/click behavior was not rerun through an available browser. Optional avatar/email delivery and a clean production build/deployment were not verified. |

## Security and environment review

Scanned modified/untracked text for credential assignments, credential-bearing
MongoDB URIs, JWT literals, private-key material, mnemonic/key references, legacy
DEV settings and dynamic execution patterns. Also compared private runtime values
against the candidate submission contents without printing them: **zero actual
runtime credential matches**. This is a targeted source review, not a guarantee
that no unknown secret or vulnerability exists.

| File / location | Sensitive type | Recommended action / final state |
| --- | --- | --- |
| `web/.env:8` | Database connection credential | Keep ignored; rotate previously exposed credential and update locally. |
| `web/.env:12` | JWT signing secret | Keep ignored; never submit. |
| `web/src/config/.config.env` (historical lines 1–3) | Encoded remote endpoint/header credential settings | Include the deletion, never restore; owner should assess historical exposure and revoke operational credentials. Do not contact endpoint. |
| `web/src/config/config.env.example` optional service sections | Inherited service identifiers/key-like examples | Blanked in Phase 5; now only empty placeholders and harmless local defaults. |
| `web/src/tests/auth.test.ts`, unavailable-database case | Deliberately fake loopback database credentials | Safe negative-test fixture, not an operational account; tests verify it is not logged. |
| `web/lib/services/frontend.test.ts` | Fake passwords/token labels in mocked fetch/storage | Safe isolated test values, not real JWTs; retain tests. |

Backend integration tests generate real test passwords/secrets only in memory and
use isolated local databases. No production credentials were used for these tests.
Mnemonic/private-key/RPC/API/Cloudinary/Bearer secrets were not found in candidate
submission code. The deleted historical configuration remains in the removed side
of Git diffs/history; raw historical diffs must not be pasted into public reports.

Read-only `git check-ignore` probes confirm `.env`, both `node_modules` trees,
`.review-local`, `.phase*-browser-profile`, `*.log` and known `apax_*_test_*`
export directory patterns are ignored. MongoDB databases are server-side, not Git
files: local enumeration found **zero remaining assessment test databases** after
cleanup. Ignore rules cannot hide credentials already tracked in history.

## Backend and frontend assessment

Login validates primitive credentials, queries MongoDB, uses bcrypt, signs HS256
JWTs with environment secret and `{ id, email }` plus expiry, then sends only a
safe user projection. Bearer middleware validates algorithm/payload and reloads
the user; role checks use current database state. No cookie authentication
fallback remains. Generic server errors do not expose stacks or database details.

Holdings route protection derives its query from `req.user._id`, never client
user ID. The unique user/metal index prevents duplicates; finite/nonnegative schema
checks and zero defaults are tested. Production must provision the index when
automatic indexing is disabled. Mongoose validation is not a database-level guard
against out-of-band writes.

The frontend sends `POST /user/login`, persists only `apax_token`, redirects to
`/dashboard`, adds Bearer headers, and loads typed holdings into Zustand. Loading,
inline errors, retry, empty chart, 401/logout cleanup and stale-token response
guards are present. Account switching clears holdings before loading a new user;
storage events cover cross-tab changes. Wallet buttons are disabled. No
`/dashbaord` typo remains in executable source; it appears only in historical
documentation. Personal metals start at zero and never fall back to fixtures.

Remaining security boundaries: localStorage is script-readable; logout/password
changes do not revoke old JWTs; CORS is unrestricted; login has no rate limit.
Legacy recovery uses request Host to build reset links, has no full primitive
input validation, and reveals account existence. Before enabling provider-backed
recovery in production, use a trusted configured origin, validate inputs, add abuse
controls and review logging/delivery. The optional Cloudinary path still requires
SDK/provider configuration; putting example-named variables in a file alone does
not establish a working provider integration. These legacy features were not
expanded in this assessment review.

## Blockchain assessment

APXGold uses OpenZeppelin ERC-20/AccessControl/ERC20Pausable, with separate admin,
minter and redeemer roles. Nonzero holders must be approved; delegated transfer
operators also require approval. Mint requires minter role, burn requires redeemer
role and holder allowance, and pause blocks all supply movement. Zero endpoints
are exempt only for internal mint/burn accounting. Unapproved holders cannot burn.

All 42 contract tests pass. Both shared ABIs match their compiled local artifacts.
The original APAXToken is unchanged; its legacy backend service still expects an
incompatible vault interface and remains disconnected. No live addresses were
verified or used, no private keys/funds supplied, and fixtures instantiate contracts
only in Hardhat's simulated network.

The blockchain document covers ERC-20 versus ERC-3643, custody-to-mint approval,
redemption-before-release sequencing, premature-burn risk, compromised roles,
double minting, races, centralized administration, future oracle risks, private
keys, event finality/idempotency/reorg handling and source-of-truth boundaries.
`balanceOf`/`allowance` integration and a production indexer are **documented only**.
There are no claims of automatically proven physical reserves, MongoDB-authoritative
chain balances, production readiness or implemented physical settlement.

## Runtime and verification evidence

Existing Next.js `http://localhost:3000/login` and Express `http://localhost:4000/`
returned HTTP 200. The local MongoDB Windows service is running. Existing user
development processes were not stopped or replaced: **restart the API to load the
Phase 5 registration/startup fixes** (`tsx` is not in watch mode).

Fresh backend test children bypass application `.env`, use generated signing
secrets and unique local databases, and prove clean startup/database connection
on isolated free ports. Tests also prove missing JWT secret/URI, unavailable
database and occupied port fail without a false listening message. Standard
ports were verified on the existing processes, not claimed as a fresh clean boot.

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Backend authentication (`npm.cmd run test:auth`) | 21 | 0 | 0 |
| Backend holdings (`npm.cmd run test:holdings`) | 20 | 0 | 0 |
| Frontend API/session (`npm.cmd run test:frontend`) | 8 | 0 | 0 |
| Smart contracts (`npm.cmd test`) | 42 | 0 | 0 |
| Total automated tests | **91** | **0** | **0** |

Web `tsc --noEmit --incremental false`, contract `tsc --noEmit`, web ESLint and
`git diff --check` pass. No separate Solidity linter is configured. Hardhat's
deprecation warning is retained and disclosed. The initial registration probe
returned 500 before the fix; the final registration regression passes with 201.
No test failures are being waived.

Current HTTP evidence covers register → valid/invalid login → signed JWT →
authenticated populated/zero holdings, cross-user isolation and 401. Session tests
cover 401/logout clearing and stale-session responses. Current browser selection
failed with “No browser is available”; discovery returned an empty list. Therefore
Phase 5 does not mark dashboard redirect, visible loading/rendering or logout clicks
as freshly browser-verified. Phase 3 previously exercised those UI flows; a final
reviewer click-through remains recommended.

## Assessment requirement matrix

“Implemented” refers to assessment code, not production certification. “Documented”
means explanation only, without application integration.

| Requirement | Status | Implementation/file | Verification |
| --- | --- | --- | --- |
| JWT generation | Implemented | `web/src/models/userModel.ts` | Auth tests |
| ID/email payload | Implemented | `userModel.ts`, `sendToken.ts` | Exact claim assertions |
| Environment signing secret | Implemented | `web/src/config/auth.ts` | Missing/invalid config tests |
| Bearer middleware | Implemented | `web/src/middlewares/user_actions/auth.ts` | Invalid, expired, cookie-only and role tests |
| GET /api/holdings | Implemented | `web/src/routes/holdings.ts`, controller, app | Real HTTP tests |
| Mongoose holdings | Implemented | `web/src/models/holdingModel.ts` | Persistence, values and unique-index tests |
| Unauthenticated rejection | Implemented | Bearer middleware | 401 assertions |
| Security basics | Partial / assessment scope | User projection, bcrypt, errors, remote-code removal | Auth tests and source scan; production gaps above |
| POST /user/login frontend | Implemented | `web/lib/services/login.api.ts`, login page | API/session tests; prior Phase 3 browser |
| JWT persistence | Implemented | `web/lib/session.ts` | Storage/session tests |
| Dashboard redirect | Implemented | `web/app/login/page.tsx`, dashboard page | Source + prior Phase 3 browser; no fresh UI pass |
| Loading states | Implemented | Login/dashboard pages | Source + prior Phase 3 browser |
| Errors/retry | Implemented | `base.api.ts`, login/dashboard | API tests + prior Phase 3 browser |
| Live personal holdings | Implemented (MongoDB) | `holdings.api.ts`, dashboard, store | Backend/API tests; no chain-balance claim |
| TypeScript types | Implemented | `web/src/types/api.ts`, services/store | Web TypeScript pass |
| 401/logout/account switching | Implemented | Session, API client, dashboard/sidebar | Session/isolation tests + prior browser evidence |
| Zero holdings / disabled wallet | Implemented | Allocation chart/store/login | Zero-value tests + source/prior browser |
| Token design / ERC-20 vs ERC-3643 | Implemented + rationale documented | APXGold, blockchain assessment | Compilation/tests + document review |
| Admin/minter roles | Implemented | `APXGold.sol` | Role grant/revoke/unauthorized tests |
| Compliance restrictions | Implemented | `_update`, `transferFrom` | Sender/receiver/operator revocation tests |
| Pause/unpause | Implemented | `APXGold.sol` | Transfer/mint/burn freeze tests |
| Mint/burn | Implemented primitive | `mint`, `burnFrom` | Supply, consent and unauthorized tests |
| Physical redemption | Documented only | Blockchain assessment | No settlement implementation claimed |
| Contract tests | Implemented | Two contract test files | 42 passing |
| Security discussion | Documented | Blockchain assessment | Required risk inventory reviewed |
| balanceOf / allowance frontend | Documented only | Blockchain assessment ethers example | Not integrated into UI |
| Events / source of truth | Documented only | Blockchain assessment | Chain authority, confirmations, idempotency/reorg discussion; no indexer |

## Remaining mock/demo functionality

Prices change randomly; valuation and Zakat use those prices; performance deltas
are examples. Reserve totals, verification/audit status, artificial hashes,
block/sync ticker, APX-i composition, certifications, advisory board and marketing
claims are fixtures. Redemption and payment controls are previews; notification,
report/download/support/settings/forgot-password UI actions are incomplete.
Public activity/balance endpoints use process-wide memory. Some legacy UI wording
still says “verified” or “live”; README makes the demo boundary explicit. These
claims are not evidence of reserves or certification and must not be presented as
production facts. No demo UI was removed or redesigned.

## File classification and submission scope

Include REQUIRED and USEFUL DOCUMENTATION files after human review; include the
historical sensitive file's **deletion**, never its contents. No changed/untracked
source file was classified UNNECESSARY, so none was removed. Generated dependency,
build/cache/profile/log/database files and actual environment files must not be
included. This inventory includes prior phases, not just Phase 5 edits.

| File | Classification | Reason |
| --- | --- | --- |
| `.gitignore` | REQUIRED | Secrets and local artifact exclusions |
| `README.md` | USEFUL DOCUMENTATION | Reproducible reviewer setup and boundaries |
| `smart-contracts/hardhat.config.ts` | REQUIRED | Credential-free local tests and compatible config |
| `smart-contracts/package.json` | REQUIRED | Working simulated-network test script |
| `web/app/dashboard/page.tsx` | REQUIRED | Authenticated holdings lifecycle |
| `web/app/login/page.tsx` | REQUIRED | Real login/session and disabled mock wallet |
| `web/components/app-sidebar.tsx` | REQUIRED | Safe identity and logout |
| `web/components/asset-allocation-chart.tsx` | REQUIRED | Empty holdings and APX-i boundary |
| `web/components/dashboard-layout.tsx` | REQUIRED | Demo price labeling |
| `web/components/portfolio-overview.tsx` | REQUIRED | Demo performance labeling |
| `web/components/views/dashboard-view.tsx` | REQUIRED | Remove fixed personal greeting |
| `web/lib/services/base.api.ts` | REQUIRED | Full paths, Bearer and safe errors |
| `web/lib/services/login.api.ts` | REQUIRED | Typed login response |
| `web/lib/store.ts` | REQUIRED | Real personal holdings/session reset |
| `web/package.json` | REQUIRED | Development and regression scripts |
| `web/src/config/.config.env` (deleted) | POTENTIALLY SENSITIVE | Retain security deletion; historical contents excluded |
| `web/src/config/config.env.example` | REQUIRED | Sanitized blank placeholders/local defaults |
| `web/src/config/database.ts` | REQUIRED | Safe awaited MongoDB initialization |
| `web/src/controllers/userController.ts` | REQUIRED | Remove remote execution, safe auth, fix registration |
| `web/src/index.ts` | REQUIRED | Validated startup and truthful listen status |
| `web/src/middlewares/user_actions/auth.ts` | REQUIRED | Bearer and role verification |
| `web/src/models/userModel.ts` | REQUIRED | JWT method and sensitive-field selection |
| `web/src/types/api.ts` | REQUIRED | Holdings response types |
| `web/src/utils/sendEmail.ts` | REQUIRED | Defer optional provider initialization |
| `web/src/utils/sendToken.ts` | REQUIRED | Safe user/token response, no cookie |
| `docs/APAX_AUTH_IMPLEMENTATION.md` | USEFUL DOCUMENTATION | Phase 1 record with final-state updates |
| `docs/APAX_BLOCKCHAIN_ASSESSMENT.md` | USEFUL DOCUMENTATION | Design, risks and integration explanation |
| `docs/APAX_CODEBASE_ANALYSIS.md` | USEFUL DOCUMENTATION | Explicitly historical baseline |
| `docs/APAX_FINAL_REVIEW.md` | USEFUL DOCUMENTATION | Findings, matrix, verification and inventory |
| `shared/abi/APXGold.json` | REQUIRED | Generated contract interface matches artifact |
| `smart-contracts/contracts/APXGold.sol` | REQUIRED | Separate assessment metal token |
| `smart-contracts/test/APXGold.test.ts` | REQUIRED | Contract regression coverage |
| `web/lib/services/frontend.test.ts` | REQUIRED | API/session regression coverage |
| `web/lib/services/holdings.api.ts` | REQUIRED | Typed live holdings client |
| `web/lib/session.ts` | REQUIRED | Token/session lifecycle |
| `web/src/app.ts` | REQUIRED | Testable Express composition |
| `web/src/config/auth.ts` | REQUIRED | JWT configuration validation |
| `web/src/controllers/holdingsController.ts` | REQUIRED | User-scoped MongoDB response |
| `web/src/middlewares/helpers/errorMiddleware.ts` | REQUIRED | Safe JSON errors, validation/duplicate handling |
| `web/src/models/holdingModel.ts` | REQUIRED | Indexed metal holdings schema |
| `web/src/routes/holdings.ts` | REQUIRED | Protected route |
| `web/src/tests/auth.test.ts` | REQUIRED | Real auth/startup/registration regressions |
| `web/src/tests/holdings.test.ts` | REQUIRED | Persistence/isolation regressions |

Do not include `web/.env`, optional real provider configuration, node_modules,
`.next`, Hardhat artifacts/cache/types, `.review-local`, browser profiles, logs or
database dumps. The ignored runtime file is POTENTIALLY SENSITIVE, not a submission
candidate. No permanent reviewer account was created in the application database.

## Recommended actions before commit

1. Review the classified files and confirm the credential owner has addressed the
   prior exposure. No historical secret rotation or history cleanup was performed.
2. Restart the current API to load the registration fix. Follow README to create
   a local account; use fresh development credentials and expect zero initial metals.
3. Perform the final browser click-through when browser access is available:
   wrong/right login, redirect, populated/zero holdings, logout, 401 and account switch.
4. Accept the documented assessment boundaries; track dependency, recovery and
   deployment hardening separately before any production use.

No additional source cleanup is required to obtain passing assessment checks.
Only the user should authorize the subsequent commit/submission action.

## Final Git snapshot

The snapshot below is read-only and includes all phases. `git diff --stat` covers
tracked files only; new/untracked assessment files are separately listed by status.

Branch: `apax/kuenzang-sangay`. 24 modified tracked files, one prior deletion, and 18
untracked files; no staged changes.

```text
 M .gitignore
 M README.md
 M smart-contracts/hardhat.config.ts
 M smart-contracts/package.json
 M web/app/dashboard/page.tsx
 M web/app/login/page.tsx
 M web/components/app-sidebar.tsx
 M web/components/asset-allocation-chart.tsx
 M web/components/dashboard-layout.tsx
 M web/components/portfolio-overview.tsx
 M web/components/views/dashboard-view.tsx
 M web/lib/services/base.api.ts
 M web/lib/services/login.api.ts
 M web/lib/store.ts
 M web/package.json
 D web/src/config/.config.env
 M web/src/config/config.env.example
 M web/src/config/database.ts
 M web/src/controllers/userController.ts
 M web/src/index.ts
 M web/src/middlewares/user_actions/auth.ts
 M web/src/models/userModel.ts
 M web/src/types/api.ts
 M web/src/utils/sendEmail.ts
 M web/src/utils/sendToken.ts
?? docs/APAX_AUTH_IMPLEMENTATION.md
?? docs/APAX_BLOCKCHAIN_ASSESSMENT.md
?? docs/APAX_CODEBASE_ANALYSIS.md
?? docs/APAX_FINAL_REVIEW.md
?? shared/abi/APXGold.json
?? smart-contracts/contracts/APXGold.sol
?? smart-contracts/test/APXGold.test.ts
?? web/lib/services/frontend.test.ts
?? web/lib/services/holdings.api.ts
?? web/lib/session.ts
?? web/src/app.ts
?? web/src/config/auth.ts
?? web/src/controllers/holdingsController.ts
?? web/src/middlewares/helpers/errorMiddleware.ts
?? web/src/models/holdingModel.ts
?? web/src/routes/holdings.ts
?? web/src/tests/auth.test.ts
?? web/src/tests/holdings.test.ts
```

```text
 .gitignore                                |  11 +-
 README.md                                 | 217 ++++++++++++++++++++++--------
 smart-contracts/hardhat.config.ts         |  18 +--
 smart-contracts/package.json              |   2 +-
 web/app/dashboard/page.tsx                |  78 ++++++++++-
 web/app/login/page.tsx                    |  81 ++++++-----
 web/components/app-sidebar.tsx            |  13 +-
 web/components/asset-allocation-chart.tsx |  14 +-
 web/components/dashboard-layout.tsx       |   3 +-
 web/components/portfolio-overview.tsx     |   2 +-
 web/components/views/dashboard-view.tsx   |   2 +-
 web/lib/services/base.api.ts              |  84 ++++++------
 web/lib/services/login.api.ts             |  26 +++-
 web/lib/store.ts                          |  22 ++-
 web/package.json                          |   4 +
 web/src/config/.config.env                |   3 -
 web/src/config/config.env.example         |  53 ++++----
 web/src/config/database.ts                |  20 ++-
 web/src/controllers/userController.ts     |  81 ++++-------
 web/src/index.ts                          |  47 +++----
 web/src/middlewares/user_actions/auth.ts  |  63 ++++-----
 web/src/models/userModel.ts               |  54 ++++----
 web/src/types/api.ts                      |  11 +-
 web/src/utils/sendEmail.ts                |   7 +-
 web/src/utils/sendToken.ts                |  29 ++--
 25 files changed, 552 insertions(+), 393 deletions(-)
```

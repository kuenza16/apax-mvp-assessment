# APAX Codebase Analysis

> Historical baseline only (before Phases 1–4). Authentication, personal holdings,
> frontend session handling and APXGold were subsequently implemented; the remote
> execution path was removed. Findings and line numbers below intentionally refer
> to the original revision. See [final review](APAX_FINAL_REVIEW.md) for current
> status and remaining issues; do not use this document as final setup guidance.

## 1. Executive Summary

Reviewed repository revision `d1bb17e` on 2026-09-24. This is a static repository review, not an implementation or a runtime certification. Only this requested document was added. No application files were changed, dependencies installed, servers started, tests executed, or blockchain transactions submitted.

The repository contains two Node packages: `web` combines a Next.js UI and a separate Express server, while `smart-contracts` contains a Hardhat ERC-20 project. `shared` holds an ABI and address constants, but neither running application layer imports these resources. The root README's frontend-to-backend-to-blockchain architecture describes an intention rather than the current connected data flow.

Principal findings:

- The UI is substantial, but holdings, prices, reserves, identity labels, audit activity, and certification content are local fixtures or simulations.
- Email login already attempts `POST /user/login`. It does not store a token, does not activate its loading state, and redirects to `/dashbaord`, which has no page. Wallet login unconditionally simulates success.
- Backend authentication is incomplete: `IUser.getJWTToken()` is declared but has no schema method implementation. `sendToken()` calls that missing method. The MongoDB connection function exists but is never called by the server.
- There is **no MongoDB holdings model and no `GET /api/holdings` endpoint**. Existing balance/activity APIs maintain unauthenticated, process-wide arrays of deposits and withdrawals.
- The contract is a fixed-initial-supply, owner-managed whitelist ERC-20. There is no `PortfolioVault`, metal-specific token suite, ERC-3643 implementation, pause mechanism, externally callable mint/burn, or redemption mechanism.
- **Critical execution concern:** `web/src/controllers/userController.ts:295` defines an immediately invoked async function named `getCookie`. It decodes environment values, fetches remote content, and executes `data.record.cookie` using `new Function("require", r)` with Node's `require`. Importing the controller initiates this path. This is arbitrary remote JavaScript execution capability, not cookie retrieval. Its remote payload and intent were not investigated or executed. Resolve this before running the backend with any credentials.

Evidence: `web/app/login/page.tsx`, `web/app/dashboard/page.tsx`, `web/lib/store.ts`, `web/src/index.ts`, `web/src/models/userModel.ts`, `web/src/utils/sendToken.ts`, `web/src/controllers/userController.ts`, `web/src/services/balance.ts`, `smart-contracts/contracts/APAXToken.sol`.

## 2. Technology Stack

Versions below are declarations in the package manifests, not independently verified installed versions. Neither package has a local `node_modules` directory in this checkout.

| Layer | Existing technology | Evidence |
| --- | --- | --- |
| Frontend | Next.js 16.1.6, React/React DOM 19.0.0, TypeScript ^5.9.3, App Router | `web/package.json`, `web/app/`, `web/tsconfig.json` |
| UI | Tailwind CSS ^4.1.9, Radix/shadcn-style components, Phosphor/Lucide icons, Recharts 2.15.4 | `web/package.json`, `web/components.json`, `web/components/ui/`, `web/postcss.config.mjs` |
| State | Zustand 5.0.11; React component state; separate toast state | `web/lib/store.ts`, `web/hooks/use-toast.ts` |
| API | Express ^5.2.1, cors, cookie-parser, dotenv; tsx and concurrently for development | `web/package.json`, `web/src/index.ts` |
| Database/auth | Mongoose ^9.3.0, bcryptjs ^3.0.3, jsonwebtoken ^9.0.3, validator | `web/package.json`, `web/src/models/userModel.ts` |
| Other backend integrations | SendGrid, Cloudinary, axios; ethers ^6.16.0 | `web/src/utils/sendEmail.ts`, `web/src/controllers/userController.ts`, `web/src/services/blockchain.ts` |
| Contracts | Solidity pragma ^0.8.24, compiler 0.8.28, OpenZeppelin ^5.6.1, Hardhat ^3.9.0, ethers ^6.17.0, Ignition | `smart-contracts/package.json`, `smart-contracts/hardhat.config.ts`, `smart-contracts/contracts/APAXToken.sol` |
| Contract tests | Mocha/Chai, Hardhat network connection API | `smart-contracts/test/APAXToken.test.ts` |
| Configuration | ESLint 9 with Next config ^15.1.6, Prettier, separate TS configs | `web/eslint.config.mjs`, `.prettierrc`, `web/tsconfig.json`, `smart-contracts/tsconfig.json` |

`web/package-lock.json` and `web/pnpm-lock.yaml` coexist. The pnpm importer lacks backend dependencies present in `web/package.json`, including Express and Mongoose; it is stale relative to the combined package. `smart-contracts/package-lock.json` exists. No root package/workspace manifest, CI workflow, Docker configuration, or Foundry configuration was found. `forge-std` is a dependency, not evidence of a configured Foundry project.

## 3. Repository Structure

```text
apax-mvp/
|-- README.md, CONTRIBUTING.md
|-- .gitignore, .prettierrc, .prettierignore
|-- web/
|   |-- package.json, package-lock.json, pnpm-lock.yaml
|   |-- next.config.mjs, tsconfig.json, eslint.config.mjs
|   |-- postcss.config.mjs, components.json
|   |-- app/
|   |   |-- layout.tsx, page.tsx, globals.css, start.tsx
|   |   |-- login/page.tsx
|   |   `-- dashboard/page.tsx
|   |-- components/
|   |   |-- app-sidebar.tsx, dashboard-layout.tsx
|   |   |-- portfolio-overview.tsx, asset-allocation-chart.tsx
|   |   |-- sharia-certification-hub.tsx, theme-provider.tsx
|   |   |-- landing/{header,footer,hero-section,how-it-works-section,
|   |   |            metals-section,trust-section}.tsx
|   |   |-- views/{dashboard-view,por-view,zakat-view,
|   |   |          redemption-view,sharia-view}.tsx
|   |   `-- ui/                         # UI primitives and helper hooks
|   |-- hooks/{use-mobile,use-toast}.ts
|   |-- lib/
|   |   |-- store.ts, utils.ts
|   |   `-- services/{base.api,login.api}.ts
|   |-- public/                         # Branding and placeholder images
|   `-- src/                            # Separate Express backend
|       |-- index.ts
|       |-- config/{database.ts,config.env.example,.config.env}
|       |-- routes/{users,activity,balance}.ts
|       |-- controllers/userController.ts
|       |-- models/userModel.ts
|       |-- middlewares/helpers/asyncErrorHandler.ts
|       |-- middlewares/user_actions/auth.ts
|       |-- services/{balance,blockchain}.ts
|       |-- types/api.ts
|       `-- utils/{sendToken,sendEmail,errorHandler}.ts
|-- smart-contracts/
|   |-- package.json, package-lock.json, tsconfig.json, .gitignore, README.md
|   |-- hardhat.config.ts
|   |-- contracts/APAXToken.sol
|   |-- scripts/deploy.ts
|   |-- ignition/modules/APAXToken.ts
|   `-- test/APAXToken.test.ts
|-- shared/
|   |-- abi/APAXToken.json
|   |-- constants.ts
|   `-- contract-address.json
`-- docs/APAX_CODEBASE_ANALYSIS.md        # This review
```

| Directory | Responsibility, important files, and interaction |
| --- | --- |
| Root | README describes intended architecture; CONTRIBUTING describes contribution procedure. Formatting/ignore configuration is shared. README commands incorrectly imply a root npm script; scripts actually live in `web/package.json`. |
| `web/app` | Next routes and root rendering. `page.tsx` assembles landing sections; `login/page.tsx` calls the login utility; `dashboard/page.tsx` selects views from Zustand. `start.tsx` only logs a message and does not start Express. |
| `web/components` | Domain presentation consumes Zustand; landing content is mostly static. `ui` contains reusable form/layout/dialog/chart primitives, not API or authentication logic. |
| `web/hooks` | Responsive breakpoint and toast utilities consumed by UI components. Exact duplicate files also exist under `web/components/ui/use-mobile.tsx` and `use-toast.ts`. |
| `web/lib` | `store.ts` owns domain fixtures and calculations. `services/base.api.ts` wraps browser fetch; `login.api.ts` supplies the login path. `utils.ts` merges CSS classes. |
| `web/src/routes`, `controllers` | Express route definitions and user lifecycle handlers. User routes call Mongoose via the controller; activity/balance routes call an in-memory service directly. |
| `web/src/models`, `config` | Only the User schema exists. Database connection helper and environment examples exist but startup does not initialize the database. |
| `web/src/middlewares`, `utils`, `types` | Cookie JWT verification and roles, async error forwarding, token/email utilities, Error subclass, deposit/withdrawal interfaces. No centralized JSON error responder. |
| `web/src/services` | Separate memory ledger and unused ethers provider/contract. Neither reads real metal holdings. |
| `smart-contracts` | Token source, deployment alternatives, and contract tests. No application integration or automatic shared ABI/address export. |
| `shared` | Intended interface/address exchange between packages. ABI is wrapped in an `abi` property. It describes APAXToken, not the vault ABI hardcoded in the backend. |
| `web/public` | Static images only; no certification PDFs or on-chain audit evidence. |

Scope: recursive tracked/hidden file inventory; detailed reads of domain code, routes, models, services, configuration, contracts, and tests; cross-repository searches for network calls, authentication, holdings, and runtime side effects; UI utility/dependency inspection. Binary images were inventoried, not visually audited. Generated dependencies and Git object contents are outside the application review. No `AGENTS.md` or `.openai/hosting.json` was found in the repository.

## 4. Frontend Architecture

The implemented URL pages are `/`, `/login`, and `/dashboard`. There are no Next API handlers, authentication middleware/proxy, or dedicated `/portfolio`, `/activity`, `/por`, or `/redemption` routes. Within `/dashboard`, `activeView` selects one of five components without changing the URL. Refresh resets that in-memory view to `dashboard`.

| Feature | Existing behavior | Exact files |
| --- | --- | --- |
| Login | Email API attempt plus simulated wallet alternative; wallet tab is default | `web/app/login/page.tsx` |
| Dashboard | Composes portfolio, allocation, certification; displays hardcoded John greeting and ledger health/block labels | `web/components/views/dashboard-view.tsx` |
| Portfolio | Reads metal grams and prices; converts USD/oz to USD/g by dividing by 31.1035 and sums metal values | `web/components/portfolio-overview.tsx` |
| Allocation | Same valuation calculation; fixed 60/30/10 APX-i pie; APX-i balance from store | `web/components/asset-allocation-chart.tsx` |
| Proof of Reserves | Reads fixture vault totals and audit logs; refresh only runs a two-second spinner | `web/components/views/por-view.tsx` |
| Redemption | Coming Soon overlay; local selection, price, and affordability calculations only; no mutation, burn, delivery, or API | `web/components/views/redemption-view.tsx` |
| Activity/history | PoR audit feed displays fixtures and timer-generated events. No user transaction-history page or call to `/activity` | `web/components/views/por-view.tsx`, `web/app/dashboard/page.tsx` |
| Zakat | Calculates from mock holdings/prices plus local cash input; separate store calculation omits this extra cash | `web/components/views/zakat-view.tsx`, `web/lib/store.ts` |
| Certification | Hardcoded documents, scholars, issuers, dates, and status; download/verify controls have no implementation | `web/components/sharia-certification-hub.tsx`, `web/components/views/sharia-view.tsx` |
| Navigation/identity | Store-based menu selection, fixed John Doe/email, inert logout/settings/support controls | `web/components/app-sidebar.tsx` |

`web/app/layout.tsx` sets dark styling, metadata, Google font declarations, and Vercel Analytics. `web/components/theme-provider.tsx` exists but is not mounted there. Global CSS supplies gold/glass effects, animations, typography, and responsive styling. Existing UI composition can be retained for assessment integration.

The API wrapper is tightly scoped to users: every URL becomes `${baseUrl}/user${url}`. Development uses `http://localhost:4000`; production uses the current origin. No Next rewrite or checked-in reverse proxy routes production requests to Express. A holdings request cannot use the current wrapper unchanged without acquiring an incorrect `/user` prefix.

Type definitions are colocated: domain types in `web/lib/store.ts`; generic `ApiResponse` in `web/lib/services/base.api.ts`; user persistence interface in `web/src/models/userModel.ts`; deposit/withdrawal records in `web/src/types/api.ts`. There is no shared typed login/holdings response contract. `ApiResponse.data` is `any`, and the request method is `any`.

## 5. Backend Architecture

`web/src/index.ts` creates Express, installs `cors()`, cookie parsing, and JSON parsing, mounts `/activity`, `/balance`, and `/user`, exposes `GET /`, and listens on `PORT` or 4000. It does not export the app separately from listening, call `connectDatabase`, initialize Cloudinary, mount holdings, subscribe to blockchain events, or add centralized error handling.

`web/package.json` runs Next and `tsx src/index.ts` together through `concurrently` for development. `build` and `start` only operate Next; there is no production backend build/start script. `web/app/start.tsx` is unrelated to backend initialization.

User controllers include register/login/logout/profile/password recovery and admin CRUD. Registration unconditionally attempts a Cloudinary avatar upload before creating the user. Cloudinary environment variables are documented, but no explicit SDK configuration is present. SendGrid initializes its key at module import in `web/src/utils/sendEmail.ts`; controller-local dotenv initialization happens later than imported module evaluation, so configuration ordering matters.

`asyncErrorHandler.ts` forwards promise rejection to `next`. `errorHandler.ts` only defines an Error with `statusCode`; it is not Express error-response middleware. Therefore error responses are not guaranteed to match the frontend's JSON/message expectation. JWT verification errors have no explicit mapping to a clean 401 JSON response. Health currently proves HTTP process availability, not database or blockchain readiness.

## 6. Authentication Flow

### Existing email path

1. `web/app/login/page.tsx:24`, `handleLogin`, prevents submit and passes controlled email/password state to `loginApi`. Native required/email inputs provide only browser-level validation.
2. `web/lib/services/login.api.ts` calls `baseAPI('/login', 'POST', data)`.
3. `web/lib/services/base.api.ts` sends JSON to `http://localhost:4000/user/login` in development. It supplies neither `credentials: 'include'` nor an Authorization header.
4. `web/src/index.ts` mounts `web/src/routes/users.ts` at `/user`; that router maps `POST /login` to `loginUser`.
5. `web/src/controllers/userController.ts`, `loginUser`, rejects absent email/password with 400; looks up `User.findOne({ email }).select('+password')`; rejects missing users with 401.
6. `web/src/models/userModel.ts`, `comparePassword`, uses bcrypt comparison; the controller returns 401 on mismatch.
7. Controller calls `web/src/utils/sendToken.ts`. It invokes `user.getJWTToken()`.
8. **The chain is broken:** `web/src/models/userModel.ts:24` declares this method in `IUser`, but never assigns `userSchema.methods.getJWTToken`. There is no `jwt.sign` anywhere in the application. Even after connecting MongoDB and matching a password, token generation cannot succeed with this schema.
9. The intended response in `sendToken.ts` is status 200, an HTTP-only `token` cookie, and `{ success: true, user, token }`. This describes unreachable successful behavior until the missing method and database startup are repaired.
10. The frontend wrapper parses text as JSON, converts non-2xx responses to `{ success: false, message }`, and wraps a successful raw payload under `data`. Thus intended login token access would be `res.data.token`, not `res.token`.
11. Login logs the response, tests only `res.data`, and calls `router.push('/dashbaord')` at line 40. That route does not exist. Failure shows a generic alert instead of the returned message. No token/user is persisted.

An earlier blocker precedes step 5: `connectDatabase()` is not invoked, so database-backed login cannot complete normally in this entry point. Actual buffering/timeouts were not exercised.

### Exact mocked success path

`web/app/login/page.tsx:46`, `handleWalletConnect`, sets loading, waits 1500 ms, sets `vaultOpening`, waits another 1000 ms, then pushes `/dashboard` at line 57. It never connects a wallet, requests an address/signature, verifies a nonce, calls the backend, or establishes a session. MetaMask and WalletConnect buttons have no click handlers. The old simulated email delay/redirect is commented out; email login is currently a broken real API attempt, not active unconditional mock success.

`web/app/dashboard/page.tsx` renders without checking authentication. Navigating directly to `/dashboard` also displays the mock portfolio.

### Token strategy mismatch

| Mechanism | Current state |
| --- | --- |
| Cookie issuance | `sendToken.ts` intends HTTP-only cookie, configurable expiry; no explicit Secure or SameSite policy |
| Cookie consumption | `auth.ts` exclusively reads `req.cookies.token`, verifies with `JWT_SECRET`, loads `decodedData.id`, assigns `req.user` |
| Browser credentials | `base.api.ts` omits cross-origin credentials; development frontend/backend ports differ |
| CORS | `index.ts` uses unrestricted default `cors()`, with no credentialed-origin configuration |
| localStorage/sessionStorage | No authentication token storage found |
| Bearer authentication | No frontend Authorization header or backend Bearer extraction found |
| Browser identity | No auth store/provider, session bootstrap, `/user/me` integration, or protected dashboard |
| Logout | Backend clears cookie; sidebar logout has no handler; no token/state lifecycle in frontend |

There are not two competing implemented storage strategies: cookie-oriented backend code exists, while client session handling is absent. The `sidebar_state` cookie in `web/components/ui/sidebar.tsx` is a layout preference and is unrelated to authentication.

## 7. Database/MongoDB Architecture

`web/src/config/database.ts` exports `connectDatabase`, captures `MONGO_URI`, calls `mongoose.connect`, and exits on failure. It passes legacy `useNewUrlParser` and `useUnifiedTopology` options behind a type assertion; their compatibility with the declared modern Mongoose dependency must be verified before enabling this helper. There is no import/call of this helper from server startup.

The only schema, `web/src/models/userModel.ts`, defines required name/email/gender/password, unique validated email, optional avatar, default role `user`, creation date, and reset token/expiry. Password is hidden by default, hashed with bcrypt cost 10 on modified saves, and compared by an instance method. Reset tokens are random bytes whose SHA-256 digest is persisted with a 15-minute expiry. There is no wallet address, holding reference, metal balance, KYC status, transaction collection, or seed/migration script.

**Holdings model/API does not exist.** The nearest concepts are:

- `web/lib/store.ts`: browser-only `UserHolding` interface and a fixture; not a Mongoose schema.
- `web/src/services/balance.ts`: global deposit/withdrawal arrays, reset on process restart. Records contain numeric id, caller-supplied user string, amount, ISO date. No metal, units, ownership checks, persistence, net balance calculation, or blockchain validation.
- `web/src/types/api.ts`: TypeScript record interfaces only.
- `smart-contracts/contracts/APAXToken.sol`: a fungible token balance, with no mapping to MongoDB users or individual metals.

### Environment inventory

Values are intentionally not reproduced. The tracked `web/src/config/.config.env` contains only `DEV_API_KEY`, `DEV_SECRET_KEY`, and `DEV_SECRET_VALUE`, used by the remote execution path. Base64 encoding does not make them safe secrets. `.gitignore` ignores `.env*`, which does not match `.config.env`; the latter is tracked.

| Variables | Consumer and current provision |
| --- | --- |
| `PORT` | `web/src/index.ts`; default 4000; example includes it |
| `MONGO_URI` | `web/src/config/database.ts`; example only; no actual database URI in checked-in runtime config |
| `JWT_SECRET` | `web/src/middlewares/user_actions/auth.ts`; example only; signing not implemented |
| `JWT_EXPIRE` | Present in example; no code consumes it |
| `COOKIE_EXPIRE` | `web/src/utils/sendToken.ts`; defaults to seven days; example uses a different duration from JWT expiry |
| `SENDGRID_API_KEY`, `SENDGRID_MAIL`, `SENDGRID_RESET_TEMPLATEID` | `sendEmail.ts` and controller; example values only |
| `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Example documents them; explicit SDK initialization absent |
| `RPC_URL`, `CONTRACT_ADDRESS` | Unused `web/src/services/blockchain.ts`; absent from backend example |
| `SEPOLIA_RPC_URL`, `SEPOLIA_PRIVATE_KEY`, `ETHERSCAN_API_KEY` | `smart-contracts/hardhat.config.ts`; no contract environment example/runtime file found |
| `DEV_API_KEY`, `DEV_SECRET_KEY`, `DEV_SECRET_VALUE` | Tracked `.config.env`; controller decodes these to a remote URL/header credentials; not ordinary authentication configuration |
| `NODE_ENV` | Controls production relative API URL in `web/lib/services/base.api.ts` |

`config.env.example` also contains unused Stripe, SMTP, Paytm, and SendGrid order-template settings. Its instruction to place `.env` at project root is ambiguous: dotenv paths depend on process working directory, while the combined dev script resides in `web`. Externally injected environment values remain unknown; missing from checkout does not prove missing in deployment.

## 8. Existing API Endpoints

Paths below include the mounts in `web/src/index.ts`. Existence means declared source route, not demonstrated runtime success.

| Method/path | Protection | Handler/result | Source |
| --- | --- | --- | --- |
| `GET /` | None | Backend-running message | `web/src/index.ts` |
| `POST /user/register` | None | Cloudinary upload, create User, intended token response (201) | `web/src/routes/users.ts`, `web/src/controllers/userController.ts` |
| `POST /user/login` | None | Credentials lookup/compare, broken token generation | Same user route/controller files |
| `GET /user/logout` | None | Expire cookie; success/message | Same user route/controller files |
| `GET /user/me` | Cookie JWT | `{ success, user }` | Same files plus `web/src/middlewares/user_actions/auth.ts` |
| `PUT /user/me/update` | Cookie JWT | Name/email/avatar update; success | Same user route/controller/auth files |
| `POST /user/password/forgot` | None | Save reset digest and send email | Same user route/controller files |
| `PUT /user/password/reset/:token` | Reset token | Change password; intended token response | Same user route/controller files |
| `PUT /user/password/update` | Cookie JWT | Verify old password, save new password | Same user route/controller/auth files |
| `GET /user/admin/users` | Cookie JWT + admin | All users | Same user route/controller/auth files |
| `GET /user/admin/user/:id` | Cookie JWT + admin | Single user | Same user route/controller/auth files |
| `PUT /user/admin/user/:id` | Cookie JWT + admin | Update name/email/gender/role | Same user route/controller/auth files |
| `DELETE /user/admin/user/:id` | Cookie JWT + admin | Delete user | Same user route/controller/auth files |
| `GET /activity` | None | Entire `{ deposits, withdrawals }` memory state | `web/src/routes/activity.ts`, `web/src/services/balance.ts` |
| `POST /activity/deposit` | None | Append `{ user, amount }` after presence check and Number conversion; 201 record | Same activity route/service files |
| `POST /activity/withdrawal` | None | Append withdrawal without available-balance check; 201 record | Same activity route/service files |
| `GET /balance` | None | Same arrays as `/activity`, not a computed balance | `web/src/routes/balance.ts`, `web/src/services/balance.ts` |

No `/api/holdings`, metal-price, proof-of-reserves, redemption, wallet-authentication, or certification endpoint exists.

## 9. State Management and Mock Data

`web/lib/store.ts` defines one non-persisted Zustand store, with setters for prices, holdings and vault data, capped audit-log insertion (50), Zakat calculation, and active view selection. It has no API effects, authenticated user, token, request status, error state, or account-specific reset logic.

Dashboard data trace:

```text
store.ts initialUserHoldings + initialMetalPrices
  -> useAPAXStore()
  -> PortfolioOverview / AssetAllocationChart
  -> local valuation -> displayed portfolio

dashboard/page.tsx five-second random timer -> store prices -> UI rerender
dashboard/page.tsx thirty-second random event timer -> auditLogs -> PorView
```

| Data | Actual source |
| --- | --- |
| Personal metals | `web/lib/store.ts:78`: gold 156.75 g, silver 892.40 g, platinum 45.20 g, APX-i 1250 |
| Prices | `web/lib/store.ts:71`: 2342.50/27.85/1024.30 USD per ounce; dashboard perturbs them randomly every five seconds |
| Portfolio daily performance | `web/components/portfolio-overview.tsx`: fixed $2.34 and 0.89%, not derived from price history |
| Vault/reserve supply | `web/lib/store.ts:85`: 15678.50/89240.75/4520.25 g; 125000 minted tokens; status preselected as verified |
| Audit feed | Five initial mock logs plus random automatic entries with shortened invented hashes; no blockchain subscription |
| APX-i makeup | Fixed 60/30/10 in store utility, chart, and landing metals; no actual index contract or rebalancing |
| Identity and ledger health | `app-sidebar.tsx`, `dashboard-layout.tsx`, `views/dashboard-view.tsx` hardcoded labels |
| Marketing and certification | `web/components/landing/hero-section.tsx`, `metals-section.tsx`, `trust-section.tsx`, `web/components/sharia-certification-hub.tsx`, `web/components/views/sharia-view.tsx` |

Important inconsistencies: PoR fixtures calculate a reserve ratio of about 87.55%, yet the UI states verified and 1:1 backing. The reserve ratio assumes grams are directly comparable to token liability across metals without a real token mapping. Portfolio totals exclude APX-i holdings; whether inclusion would double-count underlying metals is unspecified. A zero-holdings response would cause allocation percentages to divide by zero in `asset-allocation-chart.tsx`.

Valuation calculations repeat across portfolio, allocation, redemption, Zakat view, and store. Zakat view includes `additionalCash`, but `calculateZakat()` in the store does not. Duplicated hook files have matching file hashes. These are maintenance observations, not a reason to redesign working UI during the assessment.

## 10. Blockchain Architecture

`smart-contracts/contracts/APAXToken.sol` is the only Solidity contract. It inherits OpenZeppelin `ERC20` and `Ownable`, names the token APAX Token/APAX, and mints `1_000_000 * 10**18` units to `initialOwner`. Constructor approval precedes minting so the whitelist hook permits issuance.

Owner-only `approveHolder` and `revokeHolder` maintain an address allowlist; custom errors cover zero address, duplicate approval, missing approval, and disallowed holders. Events record approval/revocation. `isApproved` exposes status. `_update` checks nonzero sender and recipient before delegating to ERC-20, covering transfers and transferFrom; zero-address exemptions accommodate internal mint/burn.

Limitations grounded in this contract:

- No separate gold/silver/platinum/index token representation or custody/reserve ledger.
- No portfolio vault or deposit/withdrawal interface.
- Owner control exists; separate admin/minter roles do not.
- Only constructor minting is exposed through existing behavior. Internal ERC-20 mint/burn capability is not an external issuance/redemption API.
- No pause/unpause, identity registry, claims verification, recovery, compliance module, or ERC-3643 implementation.
- Holder checks concern sender/recipient, not the spender executing transferFrom. Whether operators also need approval is a product decision.
- Ownership transfer does not automatically approve the new owner or move the old owner's token balance. Renouncing ownership can leave no actor able to update the allowlist. These semantics need explicit operational decisions.

`smart-contracts/hardhat.config.ts` uses 0.8.28 with optional production optimization (200 runs), simulated L1/OP networks and an environment-configured Sepolia network. No explicit `localhost` network is declared despite the README command; command usability and plugin configuration remain untested. `scripts/deploy.ts` deploys using the first signer and prints the address. `ignition/modules/APAXToken.ts` is an alternative deployment using account zero. Neither updates `shared` files automatically.

`shared/constants.ts` sets chain ID 11155111 and a Sepolia token address; `shared/contract-address.json` stores localhost and Sepolia addresses. Their actual deployment/code provenance was not verified. UI copy repeatedly names SidraChain, so target-chain intent is inconsistent.

`shared/abi/APAXToken.json` has the token interface including `balanceOf`, whitelist and ownership methods. In contrast, unused `web/src/services/blockchain.ts` hardcodes `getBalance(address)`, `Deposited`, and `Withdrawn`, which do not exist in APAXToken. It constructs a read-only JSON-RPC contract without a signer or event listeners, and no route imports it. No wagmi, browser ethers integration, or actual wallet connection code exists.

Tests: `smart-contracts/test/APAXToken.test.ts` contains 23 cases for initial supply/approval, holder management, ownership transfer, transfers, and transferFrom recipient restrictions. Tests were inspected, not run. Missing cases include revoked senders, unauthorized revocation, allowance/balance edge cases, ownership/whitelist lifecycle and renunciation, and the assessment's unimplemented pause/mint/burn/redemption operations. `smart-contracts/package.json` has a deliberately failing placeholder `npm test`; README instead says `npx hardhat test`. No backend/frontend tests were found.

## 11. Assessment Gap Matrix

IMPLEMENTED means source contains the specified behavior, not a passing runtime test. PARTIALLY IMPLEMENTED means relevant code exists but is incomplete/disconnected. MISSING means absent from recursively inspected source; evidence names the relevant existing implementation locations. UNCLEAR marks externally dependent facts.

### Backend

| Requirement | Classification | Evidence and conclusion |
| --- | --- | --- |
| Working JWT generation | MISSING | `web/src/models/userModel.ts` declares but does not implement `getJWTToken`; `web/src/utils/sendToken.ts` calls it |
| JWT payload with user ID and email | MISSING | No signing payload in `web/src/models/userModel.ts`; `web/src/middlewares/user_actions/auth.ts` expects only `id` |
| Signing secret from environment | PARTIALLY IMPLEMENTED | `web/src/config/config.env.example` documents `JWT_SECRET`; `auth.ts` uses it for verification; signing absent |
| Consistent frontend/backend token strategy | MISSING | `sendToken.ts`/`auth.ts` assume cookie; `web/lib/services/base.api.ts` omits cross-origin credentials and Bearer; `web/app/login/page.tsx` stores nothing |
| Authenticated `GET /api/holdings` | MISSING | Not mounted in `web/src/index.ts`; only users/activity/balance routers exist |
| Mongoose holdings schema | MISSING | Only `web/src/models/userModel.ts`; `web/src/services/balance.ts` is memory-only |
| Clean unauthenticated response | PARTIALLY IMPLEMENTED | `auth.ts` creates 401 for missing cookie; `web/src/index.ts` has no JSON error middleware or JWT-error normalization |
| Helmet | MISSING | No setup in `web/src/index.ts` or dependency in `web/package.json` |
| Authentication rate limiting | MISSING | No limiter in `web/src/index.ts`, `web/src/routes/users.ts`, or `web/package.json` |
| CORS | PARTIALLY IMPLEMENTED | `web/src/index.ts` calls `cors()`; no origin policy/credential alignment |
| MongoDB initialization | PARTIALLY IMPLEMENTED | `web/src/config/database.ts` exists but `web/src/index.ts` never invokes it |
| Password hashing/verification | IMPLEMENTED | bcrypt save hook and comparison in `web/src/models/userModel.ts`; exercised by controller source |

### Frontend

| Requirement | Classification | Evidence and conclusion |
| --- | --- | --- |
| `POST /user/login` | IMPLEMENTED | `web/app/login/page.tsx` -> `web/lib/services/login.api.ts` -> `base.api.ts`; backend success remains broken |
| Real authentication instead of mock success | PARTIALLY IMPLEMENTED | Email calls API, but wallet simulates success and dashboard is unguarded in `web/app/login/page.tsx`, `web/app/dashboard/page.tsx` |
| JWT storage/session use | MISSING | `web/app/login/page.tsx`, `web/lib/services/base.api.ts`, `web/lib/store.ts` lack token/session lifecycle |
| Redirect after login | PARTIALLY IMPLEMENTED | `web/app/login/page.tsx:40` uses `/dashbaord`; only mock wallet redirects correctly |
| Loading state | PARTIALLY IMPLEMENTED | State/spinner exist in login page; email `setIsLoading(true)` is commented out; no request finalization |
| Error state | PARTIALLY IMPLEMENTED | `base.api.ts` returns errors; login page discards message and alerts generically; no inline error state |
| Live holdings integration | MISSING | Dashboard and portfolio consume fixtures from `web/lib/store.ts`; no holdings client |
| Replacement of relevant mock data | MISSING | `web/lib/store.ts`, `web/app/dashboard/page.tsx`, `web/components/portfolio-overview.tsx` retain fixtures/random updates |

### Blockchain

| Requirement | Classification | Evidence and conclusion |
| --- | --- | --- |
| Compliance-aware metal token design | PARTIALLY IMPLEMENTED | `smart-contracts/contracts/APAXToken.sol` restricts holders but has no metal/custody/identity model |
| ERC-20 | IMPLEMENTED | APAXToken inherits OpenZeppelin ERC20 |
| ERC-3643 considerations/implementation | MISSING | No ERC-3643 design discussion in `smart-contracts/README.md` or modules in `smart-contracts/contracts/APAXToken.sol` |
| Admin/minter roles | PARTIALLY IMPLEMENTED | APAXToken has only Ownable administration, no minter role |
| Transfer restrictions | IMPLEMENTED | APAXToken `_update` checks holder allowlist; tests cover several recipient restrictions |
| Pause functionality | MISSING | No pause state/functions in APAXToken |
| Mint/burn | PARTIALLY IMPLEMENTED | Constructor mints fixed supply; no external mint/burn in APAXToken or shared ABI |
| Redemption | MISSING | No contract or API mechanism; `web/components/views/redemption-view.tsx` is Coming Soon |
| Tests/security considerations | PARTIALLY IMPLEMENTED | 23 cases in `smart-contracts/test/APAXToken.test.ts`; no tests for absent assessment features, no full security evaluation |
| PortfolioVault/equivalent | MISSING | Only APAXToken under `smart-contracts/contracts`; backend vault ABI has no matching implementation |
| Live deployment and actual chain | UNCLEAR | `shared/contract-address.json`, `shared/constants.ts`, Hardhat Sepolia config versus SidraChain UI copy; no chain read performed |

## 12. Security Observations

These observations describe source behavior and recommended follow-up, not changes made or a complete security audit.

| Priority | Finding, impact, and exact evidence |
| --- | --- |
| Critical | **Remote code execution on controller import:** `web/src/controllers/userController.ts:295` starts an async IIFE, decodes URL/header credentials from tracked `web/src/config/.config.env`, downloads code, executes it at lines 307-308 with Node require, and silently catches errors. Server startup imports this controller through users routes. Remote content could exercise the process's filesystem/network/credential privileges. No payload was fetched; execution success and historical compromise are unknown. |
| High | **Password-hash response exposure if token generation is repaired alone:** login explicitly selects password; `web/src/utils/sendToken.ts` serializes the entire user without a sanitizing transform. Schema `select: false` does not remove an explicitly selected field. Registration/password updates also pass password-bearing documents. Return a safe user projection as part of future auth work. |
| High | **Unauthenticated shared ledger:** `web/src/routes/activity.ts`, `web/src/routes/balance.ts`, `web/src/services/balance.ts` allow anyone to read all records or append records for any supplied user. Presence checks permit negative/non-finite/non-numeric converted amounts and no balance constraints. These are demo arrays, not legitimate holdings. |
| High | **Session path incomplete:** missing JWT method/database boot, unguarded dashboard, cross-origin cookie omissions, and incorrect redirect, as traced in section 6. |
| Medium | **Unvalidated request shapes:** `web/src/controllers/userController.ts` checks presence rather than ensuring primitive email/password types before a Mongo query; no common request schema, role enum, or rate limit. Explicit input validation is needed before treating public handlers as hardened. |
| Medium | **Error response mismatch:** `asyncErrorHandler.ts` forwards errors but `web/src/index.ts` has no JSON serializer. `base.api.ts` may replace the useful error with “Invalid JSON response from server.” Default development error output may expose stack details. |
| Medium | **Cookie/CORS policy unfinished:** `sendToken.ts` sets HTTP-only but no explicit Secure/SameSite; `index.ts` enables unrestricted CORS. Credentialed cookie use requires coordinated origin/CSRF decisions. JWT and cookie lifetimes are configured separately. |
| Medium | **Reset flow inconsistencies:** controller builds `https://<request host>/password/reset/<token>`, whereas API route is `/user/password/reset/:token` and no frontend reset page exists. Host-derived links, unknown-user 404 responses, and unlimited requests warrant review. |
| Medium | **Configuration risks:** tracked encoded remote credentials, public example signing secret, absent runtime DB/JWT setup, controller-local dotenv, and import-time SendGrid initialization. Never promote sample credentials to operational settings. |
| Medium | **Misleading reserve/compliance indicators:** UI states live verification and 1:1 backing using contradictory fixtures; certifications and abbreviated hashes are not proof. Evidence in `web/lib/store.ts`, `web/components/views/por-view.tsx`, and certification components. |
| Medium | **Contract administrative lifecycle:** APAXToken concentrates control in one owner and permits revocation/renunciation without an operational recovery design. Existing whitelist is not evidence of real identity/compliance checks. |

Additional correctness and maintainability observations:

- TypeScript strict mode is configured in `web/tsconfig.json`, but `web/next.config.mjs` sets `ignoreBuildErrors: true`. A successful Next build would not establish type correctness. No compiler diagnostics were collected.
- The missing JWT method is masked by the declared `IUser` interface. `AuthenticatedRequest.user?: any`, `ApiResponse.data?: any`, untyped method parameter, environment assertions, and `as mongoose.ConnectOptions` weaken checks (`auth.ts`, `base.api.ts`, `database.ts`). Separate AuthRequest/AuthenticatedRequest declarations duplicate request typing.
- Verify Mongoose save-hook typing (unused `next` argument), current driver options, and Hardhat config typings once dependencies are available. These are compatibility checks, not claimed observed compiler failures.
- Frontend/backend envelopes differ: token response has top-level user/token, wrapper defines message/data, and balance routes return raw arrays inside an object. No shared schema protects integration (`sendToken.ts`, `base.api.ts`, `routes/balance.ts`).
- The API base is hardcoded for development and needs a documented production proxy/base URL. `next.config.mjs` has no rewrite, and `web/package.json` production scripts do not launch Express.
- `web/package.json` declares Next 16 but `eslint-config-next` 15, and two dependencies use `latest`. Combined with stale pnpm lock, installation/check reproducibility needs verification; no package vulnerability claims were inferred.
- `/noise.png` used by login and `/apple-icon.png` referenced by layout are absent from `web/public`. Redemption's unused option image strings also point to missing `/images/image.png`; those images are not currently rendered.
- Landing `#reserve-data` links have no matching section in `web/app/page.tsx`'s assembled components. Many other links/buttons are placeholders. Landing redemption minimum of 100 g conflicts with 1 g/10 g preview options.
- Domain timestamps are initialized with `new Date()` and state resets on reload; there is no persistence/date deserialization strategy for eventual API results (`web/lib/store.ts`). API ISO strings will need normalization where Date methods are expected.
- Tests exist only for contracts. No observed runtime results, deployment verification, or evidence supporting legal/certification marketing claims is available from this review.

## 13. Files Likely to Require Changes

All entries below are proposals for the later implementation phase. Preserve the existing package layout, routing conventions, components, and useful schema methods.

| Work | Existing files to modify | New files actually needed or optional |
| --- | --- | --- |
| Eliminate unsafe startup behavior | `web/src/controllers/userController.ts`, `web/src/config/.config.env`, `.gitignore`; inspect unused associated dependencies in `web/package.json` | None required; secret rotation/history response depends on investigation |
| Database/env bootstrap | `web/src/index.ts`, `web/src/config/database.ts`, `web/src/config/config.env.example` | Local untracked runtime env needed for execution; dedicated config module optional |
| JWT generation/safe response | `web/src/models/userModel.ts`, `web/src/utils/sendToken.ts`, `web/src/controllers/userController.ts` | None required for core logic |
| Consistent token verification/errors | `web/src/middlewares/user_actions/auth.ts`, `web/src/index.ts`, `web/lib/services/base.api.ts` | Proposed `web/src/middlewares/helpers/errorMiddleware.ts` for centralized responses; inline middleware is possible |
| Holdings persistence/API | `web/src/index.ts`, `web/src/types/api.ts` | Proposed `web/src/models/holdingModel.ts`, `web/src/controllers/holdingsController.ts`, `web/src/routes/holdings.ts`; dedicated model/router fit existing layers; separate service optional |
| Login/session UI | `web/app/login/page.tsx`, `web/lib/services/login.api.ts`, `web/lib/services/base.api.ts`, `web/lib/store.ts`, `web/components/app-sidebar.tsx`, `web/app/dashboard/page.tsx` | Separate auth store/helper optional; no new UI architecture required |
| Dashboard holdings | `web/lib/store.ts`, `web/app/dashboard/page.tsx`, `web/components/portfolio-overview.tsx`, `web/components/asset-allocation-chart.tsx`, `web/components/views/dashboard-view.tsx`; review Zakat/redemption consumers | Proposed `web/lib/services/holdings.api.ts`; shared response type may live in existing `web/src/types/api.ts` or a small dedicated type module |
| Security and scripts | `web/src/index.ts`, `web/src/routes/users.ts`, `web/package.json`, chosen lockfile, `web/next.config.mjs`, relevant TS/config files | Integration tests are new because none exist; test framework choice remains open |
| Conditional blockchain expansion | `smart-contracts/contracts/APAXToken.sol`, `smart-contracts/test/APAXToken.test.ts`, `smart-contracts/hardhat.config.ts`, deployment files, `smart-contracts/package.json`, `shared/abi/APAXToken.json`, `shared/constants.ts`, `shared/contract-address.json`, `web/src/services/blockchain.ts` | A vault or separate metal contracts only if confirmed necessary; contract env example advisable; do not create PortfolioVault solely to match stale prose |
| Documentation | `README.md`, `smart-contracts/README.md`, `web/src/config/config.env.example` | No additional design document required unless blockchain scope warrants one |

## 14. Recommended Implementation Sequence

0. **Resolve the import-time remote execution path before any application execution.** Inspect provenance and remove/quarantine that behavior in the future authorized implementation. Determine whether encoded credentials were operational and whether prior execution needs incident follow-up. Do not invoke the remote payload. This prerequisite concerns `userController.ts`, `.config.env`, and ignore rules; no new application layer is needed.

1. **Backend authentication foundation.** Load validated environment configuration before SDK/model initialization; connect MongoDB before listening; keep the existing User schema and bcrypt flow. Implement `getJWTToken` with an explicit ID/email payload, environment signing secret, and expiry. Return only safe user fields. Add JSON error normalization. Files are listed in section 13. Validate successful/incorrect/missing credentials, absent configuration, DB failure, no leaked password hash, and token verification.

2. **One JWT strategy across layers.** Prefer completing the existing HTTP-only cookie approach if the rubric permits it: align fetch credentials, exact allowed origins, cookie security, logout and session restoration. If the rubric specifically demands localStorage plus Bearer, use that consistently in login, wrapper, and middleware and document browser-script exposure; do not accidentally keep two divergent strategies. Add clean 401 behavior for missing, malformed, expired tokens and deleted users. Do not infer authorization from client token presence alone. No separate auth service is necessary.

3. **MongoDB holdings.** Define ownership by authenticated User ObjectId, metal quantities/units, numeric precision, nonnegative constraints, timestamps, and one-per-user versus per-metal uniqueness before creating `holdingModel.ts`. Preserve frontend field names through an explicit DTO where useful. Use fixture/seed data only through a deliberate assessment setup, not silent production fallback. Decide whether APX-i is separate from underlying holdings. Verify persistence and cross-user isolation. Do not repurpose global deposit/withdrawal arrays as authoritative holdings.

4. **Authenticated `GET /api/holdings`.** Add the small router/controller and mount at the exact path. Derive the owner from verified `req.user`, never a caller-selected user ID. Define a stable success/error envelope and empty-account response. Test unauthenticated/expired-token cases, empty holdings, valid values, DB errors, and attempts to read another user's records. Generalize `base.api.ts` so `/user/login` remains correct and `/api/holdings` has no unwanted prefix.

5. **Frontend login integration.** Retain the form/layout; wire pending/finally state, useful inline errors, successful session establishment, `/dashboard` redirect, authenticated session bootstrap, and functional logout/state clearing. Disable or clearly segregate the mock wallet path until real wallet authentication is in scope. Test rejected credentials, server failure, refresh, direct dashboard navigation, and logout. Existing login utility/store/sidebar/dashboard files suffice; a focused session helper is optional.

6. **Dashboard holdings integration.** Fetch holdings after authenticated identity is established; model loading/empty/error/success separately, then feed the existing components. Remove the default personal-holdings fixture from the authenticated path and prevent stale holdings leaking across logout/account changes. Handle zero totals and API numeric/date conversion. Prices and global reserve data require separate sources: removing holdings mocks does not make random prices or audit logs real. Disable/label remaining demo feeds until a real source is defined, and preserve existing PoR/redemption UI scope unless requested. Test chart totals and downstream consumers with zero and populated accounts.

7. **Blockchain design/testing only if required.** Confirm chain, metal/index semantics, custody authority, transfer eligibility, admin/minter separation, pause scope, redemption settlement, and whether ERC-3643 is a design discussion or implementation requirement. Extend the existing token/tests where appropriate; add contracts only for actual responsibilities. Align backend ABI with the selected contract and derive shared artifacts from builds. Test unauthorized mint/burn/pause, restriction bypass attempts, revoked senders/receivers/operators as applicable, supply invariants, redemption replay/double processing, and administration lifecycle. Use local tests before any authorized deployment.

8. **Documentation and final verification.** Correct working-directory commands, backend production startup, env placement/keys, package-manager choice, endpoint examples, token strategy, fixture setup, and test commands in existing READMEs/examples. Once implementation is authorized and prerequisites resolved, run relevant type/lint/API/UI/contract checks. Do not treat `ignoreBuildErrors` as type validation. Record remaining demos and test limitations explicitly. No dependency or code changes were made as part of this review.

## 15. Questions / Uncertainties

- Does the assessment mandate a particular JWT storage mechanism, payload key (`id`, `userId`, or `sub`), expiry, or response envelope? The request requires ID/email but does not settle those details.
- What is the required holdings shape and authoritative source: MongoDB assessment records, custody ledger, or chain balances? What are the precision/unit rules, and how should new users receive initial holdings?
- Are APX-i balances additional assets or a representation of the listed metal holdings? What supply/backing invariant should PoR calculate?
- Is blockchain work required now, a written design exercise, or a later extension? Is the target Sepolia/EVM or SidraChain? Are the checked-in addresses verified deployments?
- What is the intended purpose and origin of `getCookie` and the tracked encoded configuration? Has this backend previously run with operational secrets? No conclusions about remote payload contents or past compromise can be made from local source alone.
- Which deployment topology will connect the frontend and Express in production? Current relative production URLs have no repository-defined proxy.
- Are Cloudinary/SendGrid/register/password recovery required for the assessment, or should a documented seeded user support login testing?
- Where will real metal prices, reserve audits and certification documents come from? Current code supplies no providers/evidence.
- Which package manager and Node runtime are authoritative? Lockfiles diverge; there is no root runtime pin. Actual compiler/plugin compatibility and test outcomes remain unverified.

Review validation consisted of static source tracing, route/model inventory, authentication/holdings/blockchain searches, contract/ABI comparison, and Git change checks. Runtime behavior, external service credentials, remote payloads, dependency vulnerability status, and deployed contract state were intentionally not asserted as verified.

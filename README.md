# APAX technical assessment

Local implementation on `apax/kuenzang-sangay`: MongoDB-backed JWT login,
authenticated metal holdings, the existing Next.js dashboard connected to those
holdings, and a separately tested APXGold assessment contract. No blockchain
network is connected to the application and no APXGold deployment is provided.

## Local setup

Use Node.js 24 LTS and a local MongoDB server listening on `127.0.0.1:27017`.
There is no root `package.json`; run application commands inside `web/`.
On Windows PowerShell use `npm.cmd`/`npx.cmd` if execution policy blocks `npm`.

```powershell
cd web
npm.cmd ci
if (!(Test-Path .env)) { Copy-Item src/config/config.env.example .env }
```

Copy the example only when creating a new configuration; do not overwrite an
existing `.env`. Keep `.env` ignored. It needs:

| Variable | Purpose |
| --- | --- |
| `MONGO_URI` | Required. The example uses local MongoDB with database `apax`. |
| `JWT_SECRET` | Required. Set a long cryptographically random value; no default. |
| `JWT_EXPIRE` | Optional, defaults to `7d`; positive duration such as `1h`. |
| `PORT` | Optional, defaults to `4000`. |
| `NEXT_PUBLIC_API_URL` | Optional public API origin; development defaults to `http://localhost:4000`. Never put secrets in this variable. |

For a newly copied example with an empty JWT secret, this command writes a random
secret directly to `.env` without displaying it (run from `web/`):

```powershell
@'
const fs = require('node:fs'), crypto = require('node:crypto');
let text = fs.readFileSync('.env', 'utf8');
if (!/^JWT_SECRET=\r?$/m.test(text)) throw Error('Expected an empty JWT_SECRET');
text = text.replace(/^JWT_SECRET=\r?$/m, 'JWT_SECRET=' + crypto.randomBytes(48).toString('hex'));
fs.writeFileSync('.env', text);
'@ | node
```

Start your installed MongoDB service (Windows: `Start-Service MongoDB` in an
administrator terminal if it is stopped), or run `mongod --dbpath <local-data-dir>`
with a directory outside the repository. Then, from `web/`:

```powershell
npm.cmd run dev
```

Open `http://localhost:3000/login`. Next.js uses port 3000; Express connects to
MongoDB before listening on port 4000. Missing JWT/database configuration fails
clearly. `npm.cmd run dev:api` starts only Express; do not run a second copy while
`npm.cmd run dev` already owns port 4000. Restart the API after backend or `.env`
changes: its development command does not watch files. Restart Next after changing
public environment variables.

## First account and authentication

There are no built-in login credentials and no automatic account or holdings
seed. Create a local test account through the existing `POST /user/register` API.
It accepts JSON fields `name`, `email`, `gender`, and `password` (at least eight
characters). Omit `avatar` for the assessment; basic registration needs no external
provider. Registration returns a Bearer token and safe user details. There is no
registration UI. Use a new development password, never production credentials.

Example from PowerShell; the password is prompted securely and the token response
is not printed:

```powershell
$accountEmail = Read-Host 'Development email'
$accountPassword = Read-Host 'Development password (at least 8 characters)' -AsSecureString
$accountBody = @{
  name = 'Local reviewer'; email = $accountEmail; gender = 'unspecified'
  password = [System.Net.NetworkCredential]::new('', $accountPassword).Password
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:4000/user/register -ContentType application/json -Body $accountBody | Out-Null
Remove-Variable accountBody, accountPassword
```

Use that email/password on `/login`. The flow is:

`POST /user/login` → MongoDB/bcrypt → JWT `{ id, email, iat, exp }` → localStorage
`apax_token` → `/dashboard` → Bearer-authenticated `GET /api/holdings` → Zustand →
portfolio UI. Responses expose only `_id`, `name`, `email`, and `role`, not passwords.
No authentication cookies are issued or accepted. Wallet login is disabled.

Logout and HTTP 401 clear client token, user, personal holdings and derived Zakat
state. Tokens remain valid until expiry after logout/password changes; no server
revocation list exists. localStorage is an assessment compromise and is accessible
to page JavaScript. After a full refresh the sidebar uses a generic account label.

## Holdings and demo boundaries

`GET /api/holdings` requires `Authorization: Bearer <JWT>` and queries only
`req.user._id`; request parameters cannot select another user. Response shape:

```json
{"success":true,"holdings":{"gold":0,"silver":0,"platinum":0}}
```

Mongoose stores one finite, nonnegative amount per user/metal with timestamps and
a unique `{ user: 1, assetType: 1 }` index. Provision that index explicitly if
Mongoose auto-indexing is disabled. Missing metals return zero. There is no
holdings write endpoint or automatic holdings seed. Tests create isolated fixtures.
Loading hides values, failures show retry, and zero holdings have an empty chart.

**Live application data:** login/user identity and the authenticated user's
MongoDB gold/silver/platinum quantities. They are application holdings, not verified
on-chain balances, custody records or proof of reserves.

**Demo or disconnected:** metal prices and valuation/performance; reserve/vault
figures and refresh; audit/activity events and transaction hashes; block/sync ticker;
certifications, advisory board and compliance claims; APX-i composition (personal
balance is not connected); Zakat estimates using demo prices and payment controls;
redemption catalogue/workflow; landing-page statistics, notifications, reports,
download/support/settings/forgot-password links. Public `/activity` and `/balance`
use an unrelated in-memory demo ledger, not MongoDB personal holdings.

## Verification

From `web/`, with local MongoDB running:

```powershell
npm.cmd run test:auth
npm.cmd run test:holdings
npm.cmd run test:frontend
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
```

Backend tests start isolated API processes, generate credentials in memory, use
unique `apax_auth_test_*`/`apax_holdings_test_*` databases, and drop only their own
database afterward. They bypass the application `.env`. Optional `TEST_MONGO_URI`
selects a test server; its database path is replaced. Use only a development server.
Frontend tests exercise the API/session modules, not a complete browser suite.

From `smart-contracts/` (or `cd ../smart-contracts` from `web/`):

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npx.cmd tsc --noEmit
```

Hardhat's `hardhatMainnet` is an in-memory simulated L1, not a real mainnet
connection. First run may download Solidity 0.8.28. No wallet, RPC credentials or
funds are needed. Do not run deployment scripts for this assessment.

## Blockchain scope and limitations

The original APAXToken remains unchanged. APXGold is a separate OpenZeppelin ERC-20
with admin/minter/redeemer roles, allowlist restrictions, pause, controlled minting
and holder-consented burns. It is not a full ERC-3643 implementation, audited
production token, custody integration or reserve oracle. Future `balanceOf` and
`allowance` reads must use chain state; event indexing, finality/reorg handling and
physical redemption are documented, not implemented. The legacy backend blockchain
service does not match APAXToken's ABI and is not used for the holdings flow.

Optional avatar uploads and recovery-email delivery require separately configured
providers and remain unverified. There is no production rate limiting, full
account-recovery hardening, session revocation, or restricted CORS policy. Production
same-origin API requests require reverse proxying `/user/*` and `/api/holdings`, or
set an explicit `NEXT_PUBLIC_API_URL`. Existing dependency audit findings remain.

Read [final review and requirement matrix](docs/APAX_FINAL_REVIEW.md),
[authentication implementation](docs/APAX_AUTH_IMPLEMENTATION.md), and
[blockchain assessment](docs/APAX_BLOCKCHAIN_ASSESSMENT.md).
[Original codebase analysis](docs/APAX_CODEBASE_ANALYSIS.md) is historical evidence,
not a description of the final implementation.

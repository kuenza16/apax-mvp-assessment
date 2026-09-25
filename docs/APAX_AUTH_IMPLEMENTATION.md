# Backend authentication implementation

> Phase 1 implementation record, with the final-state updates below. References
> to frontend/holdings not being implemented describe Phase 1 only; Phases 2–4
> completed those assessment portions. See [final review](APAX_FINAL_REVIEW.md).

## Final-state updates (Phase 5)

- Frontend Bearer login, session cleanup and MongoDB holdings are now implemented.
- Registration without an avatar no longer calls Cloudinary: the optional upload
  was causing reproducible HTTP 500 responses on a clean local setup. Primitive
  input checks and schema validation run first; password hashing and the safe user
  response remain unchanged. Invalid schema input returns safe 400 JSON; duplicate
  database records return safe 409 JSON without echoing submitted values.
- API startup reports listening only on the actual server listening event, not
  Express 5's error callback. Occupied-port failure is tested.
- Authentication suite now has **21 passing tests**, including registration,
  invalid registration and occupied-port coverage; earlier 18-test results below
  are the Phase 1 checkpoint.
- A local ignored `.env` was subsequently configured. The example now contains
  only blank service placeholders and harmless local defaults. Actual secrets,
  local test artifacts and runtime databases are not submission files.
- Optional avatar upload/recovery-email provider flows remain unverified; basic
  registration and login do not need either service. Stateless JWT limitations
  and public demo routes still apply.

Branch: `apax/kuenzang-sangay`.

Scope: security cleanup and backend authentication only. Frontend, holdings,
activity/balance logic, and contracts remain unchanged. No deployment or package
installation was performed. Existing dependencies were available for checks.

## Security cleanup

Removed the entire `getCookie` async IIFE from
`web/src/controllers/userController.ts`. It ran at import time, base64-decoded a
remote URL and request header credentials, fetched `data.record.cookie`, and
executed that string through `new Function("require", r)` with Node's require.
The remote endpoint was not contacted and the payload was not executed during
this work.

Also removed its now-unused axios/dotenv/createRequire imports, the local
`require` binding, and the controller's `.config.env` loading. Deleted
`web/src/config/.config.env`, which contained only the three dedicated
`DEV_API_KEY`, `DEV_SECRET_KEY`, and `DEV_SECRET_VALUE` settings. Added
`**/.config.env` to `.gitignore`. No encoded values or payload copies were added
to documentation. Existing package dependencies were not broadly pruned.

Removal is from the working tree, not Git history. If the old encoded credentials
were operational, their owner should revoke/rotate them. This change does not
establish whether earlier execution occurred or whether the machine was affected.

## Startup and configuration

`web/src/index.ts` loads dotenv, validates JWT settings and port, awaits
`connectDatabase()`, then listens. Application route/middleware composition is
in `web/src/app.ts`; importing that module does not start a listener.

`web/src/config/database.ts` reads `MONGO_URI` at call time and uses supported
connection options, with a ten-second server-selection timeout. Missing URI or
connection failure prevents startup. Driver error details/credentials are not
printed. The obsolete driver options and premature process exit inside the
helper were removed; the entry point reports failure and exits nonzero.

Configuration is documented in `web/src/config/config.env.example`:

| Setting | Behavior |
| --- | --- |
| `MONGO_URI` | Required; no credentials hardcoded |
| `JWT_SECRET` | Required nonempty signing secret; no fallback |
| `JWT_EXPIRE` | Defaults to `7d`; positive duration with explicit unit |
| `PORT` | Defaults to 4000; integer from 1 through 65535 |

Use `web/.env` and run commands from `web`. The sample signing secret and obsolete
`COOKIE_EXPIRE` example were removed. Optional email/avatar settings remain for
unrelated existing routes. SendGrid API-key initialization now happens when mail
is sent, so login/startup do not depend on email configuration.

## JWT and authentication flow

1. `POST /user/login` validates primitive nonempty email/password values.
2. The existing controller finds a MongoDB User and explicitly selects password.
3. Existing bcrypt comparison checks the password.
4. `IUser.getJWTToken()` now signs `{ id: this._id, email: this.email }` using
   jsonwebtoken, HS256, `JWT_SECRET`, and validated `JWT_EXPIRE`. JWT adds
   `iat`/`exp`. Missing signing configuration fails clearly.
5. `sendToken` returns success/token and an explicit public-user projection:
   `_id`, name, email, role. It never serializes the full document or sets a cookie.
6. Protected endpoints parse `Authorization: Bearer <token>`, restrict verification
   to HS256, validate payload ID/email, load the user, and assign `req.user`.
7. Missing/malformed/invalid/expired tokens or nonexistent users return 401 JSON.
   Database/server errors remain 500 rather than being misreported as bad credentials.
8. Role-protected endpoints still check the current database user's role.

No cookie fallback remains. Cookie parsing was removed from application setup.
The existing logout endpoint explains that the client must discard its Bearer
token; it does not claim to revoke stateless JWTs.

User details and admin user responses also use the safe projection. Reset-token
fields are excluded from default Mongoose selection. The password hashing hook
remains in place; its unused callback parameter was removed.

`web/src/middlewares/helpers/errorMiddleware.ts` produces predictable
`{ success: false, message }` responses. Known application 4xx errors retain their
messages, malformed JSON gets 400, and unexpected/server failures return a generic
500 without stack traces or internal messages.

## Verification

The repeatable integration suite is `web/src/tests/auth.test.ts`, run through
`npm run test:auth`. It uses a uniquely named temporary database on the running
local MongoDB service, starts the real backend entry point, and makes HTTP requests.
It verifies persistence and bcrypt rather than mocking User lookups. Generated
test secrets/passwords remain in memory. Cleanup stops the child API and drops
only the generated database after checking its name.

Coverage includes:

- Valid login, signed ID/email claims, expiry, no cookies, and exact safe user fields.
- Wrong password/unknown email (401), absent email/password and non-string inputs (400).
- Missing body and malformed JSON (400).
- Authenticated `GET /user/me` and safe admin detail/list responses.
- Missing or cookie-only JWT; malformed header; invalid, wrong-signature, expired,
  wrong-algorithm and malformed-payload JWTs (401).
- Deleted users (401) and non-admin access (403).
- Password update/reset, hashing, login after change, and reset-token removal.
- Missing JWT secret/URI preventing startup; invalid expiry rejected.
- Unavailable MongoDB preventing listening without exposing connection credentials.

Commands are run from `web`:

```text
npm.cmd run test:auth
.\node_modules\.bin\tsc.cmd --noEmit --incremental false
npm.cmd run lint
```

The implementation also adds `npm run dev:api` to start only the backend.

Final results: **18 tests passed, 0 failed, 0 skipped**, using the local MongoDB
service and real HTTP/backend processes. TypeScript completed with exit code 0;
repository lint completed with exit code 0. The initial TypeScript check of the
new tests caught a headers-union typing issue; it was corrected before the final
successful check. No existing application type/lint failures remained.

## Remaining boundaries

- Frontend still has its previously documented mock wallet path, login redirect
  typo and no Bearer integration; these were deliberately not changed.
- No holdings model/API or blockchain changes were made.
- Tokens are stateless: logout/password change do not revoke previously issued
  tokens. Deleted users are rejected through the database lookup.
- Registration/avatar upload and recovery-email delivery were not externally
  exercised; they need their own provider configuration.
- Existing public activity/balance demo routes and unrestricted CORS remain;
  rate limiting/Helmet and broader API hardening are outside this phase.
- No long-lived application `.env`, real account, or permanent signing secret
  was created. Configure these before a normal development run.

The codebase analysis is retained as the original baseline, not rewritten to
erase the issues found before implementation.

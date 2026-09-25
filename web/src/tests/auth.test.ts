import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User, { type IUser } from "../models/userModel";
import connectDatabase from "../config/database";
import { getJWTConfig } from "../config/auth";

// Always use a newly named database; never clear a configured application DB.
const databaseName = `apax_auth_test_${randomUUID().replaceAll("-", "")}`;
const mongoUrl = new URL(process.env.TEST_MONGO_URI ?? "mongodb://127.0.0.1:27017");
mongoUrl.pathname = `/${databaseName}`;
const secret = randomBytes(48).toString("hex");
const password = randomBytes(24).toString("hex");
const oldEnv = { ...process.env };
let server: ChildProcess | undefined;
let baseUrl: string;
let user: IUser;
let token: string;

const spawnBackend = (env: NodeJS.ProcessEnv) => spawn(
  process.execPath,
  ["--import", "tsx", "src/index.ts"],
  { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
);

before(async () => {
  process.env.MONGO_URI = mongoUrl.toString();
  process.env.JWT_SECRET = secret;
  process.env.JWT_EXPIRE = "1h";
  await connectDatabase();
  user = await User.create({
    name: "Auth Test", email: "auth-test@example.test", gender: "unspecified", password,
    resetPasswordToken: "must-not-leak", resetPasswordExpire: new Date(Date.now() + 60000),
  });
  const stored = await User.findById(user._id).select("+password");
  assert.ok(stored);
  assert.notEqual(stored.password, password);
  assert.equal(await stored.comparePassword(password), true);

  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawnBackend({ ...process.env, PORT: String(port), DOTENV_CONFIG_PATH: ".env.auth-test-unused" });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Backend startup timed out")), 15000);
    let output = "";
    server!.stdout!.on("data", chunk => {
      output += chunk.toString();
      if (output.includes("Server listening on port")) { clearTimeout(timer); resolve(); }
    });
    server!.once("error", error => { clearTimeout(timer); reject(error); });
    server!.once("exit", () => { clearTimeout(timer); reject(new Error("Backend exited during startup")); });
  });
});

after(async () => {
  try {
    if (server && server.exitCode === null) {
      const exit = once(server, "exit");
      server.kill();
      await exit;
    }
    if (mongoose.connection.readyState === 1) {
      assert.equal(mongoose.connection.name, databaseName);
      await mongoose.connection.dropDatabase();
    }
  } finally {
    await mongoose.disconnect();
    process.env = oldEnv;
  }
});

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  return { response, body: await response.json() };
}

const login = (body: unknown) => request("/user/login", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

function assertSafeUser(value: Record<string, unknown>) {
  assert.deepEqual(Object.keys(value).sort(), ["_id", "email", "name", "role"]);
}

test("registration without avatar creates a hashed user and usable Bearer session", async () => {
  const email = "registration@example.test";
  const registrationPassword = randomBytes(24).toString("hex");
  const details = { name: "Registration Test", email, gender: "unspecified", password: registrationPassword, role: "admin" };
  const { response, body } = await request("/user/register", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details),
  });
  assert.equal(response.status, 201);
  assertSafeUser(body.user);
  assert.equal(body.user.role, "user");
  assert.equal(response.headers.get("set-cookie"), null);
  const stored = await User.findOne({ email }).select("+password");
  assert.ok(stored);
  assert.notEqual(stored.password, registrationPassword);
  assert.equal(await stored.comparePassword(registrationPassword), true);
  assert.equal((await login({ email, password: registrationPassword })).response.status, 200);
  const holdings = await request("/api/holdings", { headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(holdings.response.status, 200);
  assert.deepEqual(holdings.body.holdings, { gold: 0, silver: 0, platinum: 0 });
  const duplicate = await request("/user/register", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details),
  });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.body.message, "Record already exists");
});

test("invalid registration details return safe 400 responses", async () => {
  for (const details of [{}, { name: "Review", email: { $ne: null }, gender: "unspecified", password },
    { name: "Review", email: "invalid", gender: "unspecified", password },
    { name: "Review", email: "invalid@example.test", gender: "unspecified", password: "short" }]) {
    const result = await request("/user/register", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(details),
    });
    assert.equal(result.response.status, 400);
    assert.deepEqual(Object.keys(result.body).sort(), ["message", "success"]);
  }
});

test("login uses MongoDB/bcrypt and returns a signed ID/email JWT and safe user only", async () => {
  const { response, body } = await login({ email: user.email, password });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(body.success, true);
  assertSafeUser(body.user);
  assert.equal(JSON.stringify(body).includes("must-not-leak"), false);
  const payload = jwt.verify(body.token, secret, { algorithms: ["HS256"] });
  assert.ok(typeof payload === "object");
  assert.equal(payload.id, String(user._id));
  assert.equal(payload.email, user.email);
  assert.equal(payload.exp! - payload.iat!, 3600);
  assert.deepEqual(Object.keys(payload).sort(), ["email", "exp", "iat", "id"]);
  token = body.token;
});

for (const [name, body, status] of [
  ["wrong password", { email: "auth-test@example.test", password: "wrong-password" }, 401],
  ["unknown email", { email: "missing@example.test", password }, 401],
  ["missing email", { password }, 400],
  ["missing password", { email: "auth-test@example.test" }, 400],
  ["object email", { email: { $ne: null }, password }, 400],
  ["non-string password", { email: "auth-test@example.test", password: {} }, 400],
] as const) {
  test(`login rejects ${name} with predictable JSON`, async () => {
    const result = await login(body);
    assert.equal(result.response.status, status);
    assert.deepEqual(Object.keys(result.body).sort(), ["message", "success"]);
    assert.equal(result.body.success, false);
  });
}

test("missing body and malformed JSON are clean 400 responses", async () => {
  for (const body of [undefined, "{"]) {
    const result = await request("/user/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.success, false);
    assert.equal("stack" in result.body, false);
  }
});

test("existing /user/me authenticates Bearer token and returns no sensitive fields", async () => {
  const result = await request("/user/me", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.user._id, String(user._id));
  assertSafeUser(result.body.user);
});

test("missing JWT and cookie-only JWT are rejected", async () => {
  const cases: Record<string, string>[] = [{}, { Cookie: `token=${token}` }];
  for (const headers of cases) {
    const result = await request("/user/me", { headers });
    assert.equal(result.response.status, 401);
    assert.deepEqual(result.body, { success: false, message: "Authentication required" });
  }
});

test("malformed, invalid, expired and wrong-algorithm tokens are rejected", async () => {
  const payload = { id: String(user._id), email: user.email };
  const headers = [
    "Basic abc", "Bearer", "Bearer a b", "Bearer not-a-jwt",
    `Bearer ${jwt.sign(payload, randomBytes(32).toString("hex"))}`,
    `Bearer ${jwt.sign(payload, secret, { expiresIn: -1 })}`,
    `Bearer ${jwt.sign(payload, secret, { algorithm: "HS384" })}`,
    `Bearer ${jwt.sign({ id: "not-an-object-id", email: user.email }, secret)}`,
    `Bearer ${jwt.sign({ email: user.email }, secret)}`,
  ];
  for (const Authorization of headers) {
    const result = await request("/user/me", { headers: { Authorization } });
    assert.equal(result.response.status, 401);
    assert.equal(result.body.success, false);
    assert.deepEqual(Object.keys(result.body).sort(), ["message", "success"]);
  }
});

test("admin routes retain role checks and sanitize user lists", async () => {
  let result = await request("/user/admin/users", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 403);
  await User.updateOne({ _id: user._id }, { role: "admin" });
  result = await request("/user/admin/users", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  result.body.users.forEach(assertSafeUser);
  result = await request(`/user/admin/user/${String(user._id)}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  assertSafeUser(result.body.user);
});

test("logout does not issue cookies or claim server-side Bearer revocation", async () => {
  const result = await request("/user/logout");
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get("set-cookie"), null);
  assert.match(result.body.message, /Discard the Bearer token/);
});

test("password update and reset preserve hashing and safe token responses", async () => {
  const updatedPassword = randomBytes(24).toString("hex");
  let result = await request("/user/password/update", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ oldPassword: password, newPassword: updatedPassword }),
  });
  assert.equal(result.response.status, 200);
  assertSafeUser(result.body.user);
  assert.equal((await login({ email: user.email, password })).response.status, 401);
  assert.equal((await login({ email: user.email, password: updatedPassword })).response.status, 200);

  const resetToken = randomBytes(20).toString("hex");
  await User.updateOne({ _id: user._id }, {
    resetPasswordToken: createHash("sha256").update(resetToken).digest("hex"),
    resetPasswordExpire: new Date(Date.now() + 60000),
  });
  result = await request(`/user/password/reset/${resetToken}`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(result.response.status, 200);
  assertSafeUser(result.body.user);
  assert.equal((await login({ email: user.email, password })).response.status, 200);
  const stored = await User.findById(user._id).select("+resetPasswordToken +resetPasswordExpire");
  assert.equal(stored?.resetPasswordToken, undefined);
  assert.equal(stored?.resetPasswordExpire, undefined);
});

test("deleted user's otherwise valid JWT returns 401", async () => {
  await User.deleteOne({ _id: user._id });
  const result = await request("/user/me", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 401);
});

test("JWT generation fails clearly without secret or valid expiry", () => {
  try {
    delete process.env.JWT_SECRET;
    assert.throws(() => user.getJWTToken(), /JWT_SECRET is required/);
    process.env.JWT_SECRET = secret;
    process.env.JWT_EXPIRE = "invalid";
    assert.throws(() => getJWTConfig(), /JWT_EXPIRE/);
  } finally {
    process.env.JWT_SECRET = secret;
    process.env.JWT_EXPIRE = "1h";
  }
});

test("startup fails before listening when required configuration is missing", async () => {
  for (const key of ["JWT_SECRET", "MONGO_URI"]) {
    const env = { ...process.env, [key]: "", DOTENV_CONFIG_PATH: ".env.auth-test-unused" };
    const child = spawnBackend(env);
    let output = "";
    child.stdout!.on("data", chunk => { output += chunk.toString(); });
    child.stderr!.on("data", chunk => { output += chunk.toString(); });
    const [code] = await once(child, "exit");
    assert.equal(code, 1);
    assert.match(output, new RegExp(`${key} is required`));
    assert.equal(output.includes("Server listening"), false);
  }
});

test("unavailable MongoDB prevents listening and does not expose connection credentials", async () => {
  const child = spawnBackend({
    ...process.env,
    MONGO_URI: "mongodb://test-user:private-test-password@127.0.0.1:1/unavailable",
    DOTENV_CONFIG_PATH: ".env.auth-test-unused",
  });
  let output = "";
  child.stdout!.on("data", chunk => { output += chunk.toString(); });
  child.stderr!.on("data", chunk => { output += chunk.toString(); });
  const [code] = await once(child, "exit");
  assert.equal(code, 1);
  assert.match(output, /MongoDB connection failed/);
  assert.equal(output.includes("private-test-password"), false);
  assert.equal(output.includes("Server listening"), false);
});

test("occupied API port fails without falsely reporting a listening server", async () => {
  const child = spawnBackend({ ...process.env, PORT: new URL(baseUrl).port, DOTENV_CONFIG_PATH: ".env.auth-test-unused" });
  let output = "";
  child.stdout!.on("data", chunk => { output += chunk.toString(); });
  child.stderr!.on("data", chunk => { output += chunk.toString(); });
  const [code] = await once(child, "exit");
  assert.equal(code, 1);
  assert.match(output, /API server failed to listen/);
  assert.equal(output.includes("Server listening on port"), false);
});

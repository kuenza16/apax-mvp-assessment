import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User, { type IUser } from "../models/userModel";
import Holding from "../models/holdingModel";
import connectDatabase from "../config/database";
import type { Holdings } from "../types/api";

// Match the auth suite's real MongoDB + child API setup without changing it.
const databaseName = `apax_holdings_test_${randomUUID().replaceAll("-", "")}`;
const mongoUrl = new URL(process.env.TEST_MONGO_URI ?? "mongodb://127.0.0.1:27017");
mongoUrl.pathname = `/${databaseName}`;
const secret = randomBytes(48).toString("hex");
const password = randomBytes(24).toString("hex");
const oldEnv = { ...process.env };
let server: ChildProcess | undefined;
let baseUrl: string;
let userA: IUser;
let userB: IUser;
let partialUser: IUser;
let emptyUser: IUser;
let deletedUser: IUser;
let tokenA: string;

before(async () => {
  process.env.MONGO_URI = mongoUrl.toString();
  process.env.JWT_SECRET = secret;
  process.env.JWT_EXPIRE = "1h";
  await connectDatabase();
  // Wait for the real MongoDB unique index before writing any fixtures.
  await Holding.init();
  [userA, userB, partialUser, emptyUser, deletedUser] = await Promise.all(
    ["a", "b", "partial", "empty", "deleted"].map(name => User.create({
      name, email: `${name}@holdings.example.test`, gender: "unspecified", password,
    }))
  );
  await Holding.create([
    { user: userA._id, assetType: "gold", amount: 156.75 },
    { user: userA._id, assetType: "silver", amount: 892.40 },
    { user: userA._id, assetType: "platinum", amount: 45.20 },
    { user: userB._id, assetType: "gold", amount: 500 },
    { user: partialUser._id, assetType: "silver", amount: 25 },
    { user: deletedUser._id, assetType: "gold", amount: 100 },
  ]);

  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    env: { ...process.env, PORT: String(port), DOTENV_CONFIG_PATH: ".env.holdings-test-unused" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
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

  const login = await request("/user/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: userA.email, password }),
  });
  assert.equal(login.response.status, 200);
  tokenA = login.body.token;
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

const getHoldings = (token: string, suffix = "") => request(`/api/holdings${suffix}`, {
  headers: { Authorization: `Bearer ${token}` },
});

function assertPortfolio(result: Awaited<ReturnType<typeof request>>, holdings: Holdings) {
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, { success: true, holdings });
  assert.deepEqual(Object.keys(result.body.holdings).sort(), ["gold", "platinum", "silver"]);
}

test("authenticated login token retrieves exactly three correct metal amounts", async () => {
  assertPortfolio(await getHoldings(tokenA), { gold: 156.75, silver: 892.4, platinum: 45.2 });
});

test("missing metals return zero", async () => {
  assertPortfolio(await getHoldings(partialUser.getJWTToken()), { gold: 0, silver: 25, platinum: 0 });
});

test("new user has no automatically created holdings and receives all zeros", async () => {
  assert.equal(await Holding.countDocuments({ user: emptyUser._id }), 0);
  assertPortfolio(await getHoldings(emptyUser.getJWTToken()), { gold: 0, silver: 0, platinum: 0 });
});

test("users receive only their own persisted amounts", async () => {
  assertPortfolio(await getHoldings(userB.getJWTToken()), { gold: 500, silver: 0, platinum: 0 });
  assertPortfolio(await getHoldings(tokenA), { gold: 156.75, silver: 892.4, platinum: 45.2 });
});

test("query userId cannot override the authenticated user", async () => {
  assertPortfolio(await getHoldings(tokenA, `?userId=${String(userB._id)}`), {
    gold: 156.75, silver: 892.4, platinum: 45.2,
  });
});

for (const [name, header] of [
  ["missing Authorization", () => undefined],
  ["malformed Bearer header", () => "Bearer a b"],
  ["malformed JWT", () => "Bearer not-a-jwt"],
  ["invalid signature", () => `Bearer ${jwt.sign(
    { id: String(userA._id), email: userA.email }, randomBytes(32).toString("hex")
  )}`],
  ["expired JWT", () => `Bearer ${jwt.sign(
    { id: String(userA._id), email: userA.email }, secret, { expiresIn: -1 }
  )}`],
] as const) {
  test(`${name} returns clean 401 JSON`, async () => {
    const Authorization = header();
    const result = await request("/api/holdings", {
      headers: Authorization ? { Authorization } : {},
    });
    assert.equal(result.response.status, 401);
    assert.deepEqual(Object.keys(result.body).sort(), ["message", "success"]);
    assert.equal(result.body.success, false);
    assert.equal(typeof result.body.message, "string");
    assert.equal(JSON.stringify(result.body).includes(secret), false);
    assert.equal(JSON.stringify(result.body).includes("mongodb://"), false);
  });
}

test("deleted user returns 401 even when holdings and an unexpired token remain", async () => {
  const token = deletedUser.getJWTToken();
  await User.deleteOne({ _id: deletedUser._id });
  assert.equal(await Holding.countDocuments({ user: deletedUser._id }), 1);
  const result = await getHoldings(token);
  assert.equal(result.response.status, 401);
  assert.deepEqual(result.body, { success: false, message: "Authentication required" });
});

for (const [name, values] of [
  ["negative amount", { assetType: "gold", amount: -1 }],
  ["nonfinite amount", { assetType: "gold", amount: Infinity }],
  ["unsupported asset type", { assetType: "copper", amount: 1 }],
  ["missing amount", { assetType: "gold" }],
  ["missing asset type", { amount: 1 }],
] as const) {
  test(`schema rejects ${name}`, async () => {
    await assert.rejects(Holding.create({ user: emptyUser._id, ...values }), mongoose.Error.ValidationError);
  });
}

test("schema requires a user ObjectId reference", async () => {
  await assert.rejects(Holding.create({ assetType: "gold", amount: 1 }), mongoose.Error.ValidationError);
  await assert.rejects(Holding.create({ user: "invalid-id", assetType: "gold", amount: 1 }), mongoose.Error.ValidationError);
});

test("MongoDB compound unique index prevents duplicate user/asset pairs", async () => {
  const indexes = await Holding.collection.indexes();
  assert.ok(indexes.some(index => index.unique && index.key.user === 1 && index.key.assetType === 1));
  await assert.rejects(Holding.create({ user: userA._id, assetType: "gold", amount: 999 }),
    (error: unknown) => error instanceof mongoose.mongo.MongoServerError && error.code === 11000);
  assert.equal(await Holding.countDocuments({ user: userA._id, assetType: "gold" }), 1);
});

test("zero amount is valid and Mongoose persists timestamps", async () => {
  const holding = await Holding.create({ user: partialUser._id, assetType: "platinum", amount: 0 });
  assert.equal(holding.amount, 0);
  assert.ok(holding.createdAt instanceof Date);
  assert.ok(holding.updatedAt instanceof Date);
  const previousTimestamp = holding.updatedAt;
  holding.amount = 2;
  await holding.save();
  const stored = await Holding.findById(holding._id);
  assert.ok(stored);
  assert.equal(stored.amount, 2);
  assert.ok(stored.updatedAt >= previousTimestamp);
});

test("memory ledger deposits do not change MongoDB holdings", async () => {
  const deposit = await request("/activity/deposit", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: String(userA._id), amount: 100000 }),
  });
  assert.equal(deposit.response.status, 201);
  assertPortfolio(await getHoldings(tokenA), { gold: 156.75, silver: 892.4, platinum: 45.2 });
});

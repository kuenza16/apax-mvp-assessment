import type { SignOptions } from "jsonwebtoken";

export function getJWTConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret?.trim()) throw new Error("JWT_SECRET is required");

  const expiry = process.env.JWT_EXPIRE ?? "7d";
  // Require a time unit to avoid ambiguous numeric string durations.
  if (!/^[1-9]\d*(ms|s|m|h|d|w|y)$/.test(expiry)) {
    throw new Error("JWT_EXPIRE must be a positive duration such as 1h or 7d");
  }
  return { secret, expiresIn: expiry as SignOptions["expiresIn"] };
}

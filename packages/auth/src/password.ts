import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { ValidationError } from "./errors.js";
import type { PasswordOptions } from "./types.js";

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

const DEFAULT_KEY_LENGTH = 64;
const DEFAULT_SALT_BYTES = 16;
const DEFAULT_COST = 16384;
const DEFAULT_BLOCK_SIZE = 8;
const DEFAULT_PARALLELISM = 1;
const PREFIX = "scrypt";

function toBuffer(value: string | Buffer): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
}

export async function hashPassword(password: string, options: PasswordOptions = {}): Promise<string> {
  if (typeof password !== "string" || password.length === 0) {
    throw new ValidationError("Password must be a non-empty string");
  }

  const saltBytes = options.saltBytes ?? DEFAULT_SALT_BYTES;
  const keyLength = options.keyLength ?? DEFAULT_KEY_LENGTH;
  const N = options.cost ?? DEFAULT_COST;
  const r = options.blockSize ?? DEFAULT_BLOCK_SIZE;
  const p = options.parallelism ?? DEFAULT_PARALLELISM;
  const salt = options.salt ? toBuffer(options.salt) : randomBytes(saltBytes);
  const key = await scrypt(password, salt, keyLength, { N, r, p });

  return [
    PREFIX,
    N,
    r,
    p,
    keyLength,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (typeof password !== "string" || typeof storedHash !== "string") {
    return false;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 7 || parts[0] !== PREFIX) {
    return false;
  }

  const [, nRaw, rRaw, pRaw, lengthRaw, saltB64, hashB64] = parts;
  const N = Number.parseInt(nRaw, 10);
  const r = Number.parseInt(rRaw, 10);
  const p = Number.parseInt(pRaw, 10);
  const keyLength = Number.parseInt(lengthRaw, 10);

  if (![N, r, p, keyLength].every(Number.isFinite)) {
    return false;
  }

  try {
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(hashB64, "base64url");
    const actual = await scrypt(password, salt, keyLength, { N, r, p });
    if (actual.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function needsRehash(storedHash: string, options: PasswordOptions = {}): boolean {
  if (typeof storedHash !== "string") {
    return true;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 7 || parts[0] !== PREFIX) {
    return true;
  }

  const N = Number.parseInt(parts[1], 10);
  const r = Number.parseInt(parts[2], 10);
  const p = Number.parseInt(parts[3], 10);
  const keyLength = Number.parseInt(parts[4], 10);

  return (
    N !== (options.cost ?? DEFAULT_COST) ||
    r !== (options.blockSize ?? DEFAULT_BLOCK_SIZE) ||
    p !== (options.parallelism ?? DEFAULT_PARALLELISM) ||
    keyLength !== (options.keyLength ?? DEFAULT_KEY_LENGTH)
  );
}

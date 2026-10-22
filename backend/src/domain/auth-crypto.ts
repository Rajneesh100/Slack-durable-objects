/**
 * Pure cryptographic functions for password hashing and HMAC-SHA256 session token signing.
 * Uses Web Crypto API (SubtleCrypto) with no external dependencies.
 */

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;
const DEFAULT_SECRET = "functional-durable-objects-chat-secret-key-32b";

// Helper: Uint8Array <-> Hex string
export const toHex = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const fromHex = (hex: string): Uint8Array => {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
};

// Generate random salt
export const generateSalt = (bytes = 16): string => {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return toHex(array);
};

// Hash password with PBKDF2
export const hashPassword = async (
  password: string,
  existingSalt?: string
): Promise<{ readonly hashHex: string; readonly saltHex: string }> => {
  const saltHex = existingSalt ?? generateSalt();
  const saltBytes = fromHex(saltHex);
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    KEY_LENGTH_BITS
  );

  return {
    hashHex: toHex(derivedBits),
    saltHex,
  };
};

// Verify password
export const verifyPassword = async (
  password: string,
  expectedHashHex: string,
  saltHex: string
): Promise<boolean> => {
  const { hashHex } = await hashPassword(password, saltHex);
  return hashHex === expectedHashHex;
};

// HMAC-SHA256 Session Token signing (simple, safe, no external JWT libraries needed)
export const signSession = async (
  payload: Record<string, unknown>,
  secret = DEFAULT_SECRET
): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const payloadStr = JSON.stringify(payload);
  const payloadBase64 = btoa(payloadStr);

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payloadBase64)
  );
  const sigHex = toHex(signature);

  return `${payloadBase64}.${sigHex}`;
};

export const verifySession = async <T = Record<string, unknown>>(
  token: string,
  secret = DEFAULT_SECRET
): Promise<T | null> => {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadBase64, sigHex] = parts;
    if (!payloadBase64 || !sigHex) return null;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = fromHex(sigHex);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(payloadBase64)
    );

    if (!isValid) return null;

    const payloadJson = atob(payloadBase64);
    const parsed = JSON.parse(payloadJson) as T & { exp?: number };

    // Check expiration if present
    if (parsed.exp && parsed.exp < Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

/**
 * Enterprise Cryptographic Vault (Pure Functions)
 * - Channel Key Derivation via PBKDF2 (SHA-256)
 * - AES-GCM-256 Authenticated Encryption & Decryption (NIST SP 800-38D)
 * - Uses Web Crypto API (SubtleCrypto)
 */

const MASTER_VAULT_SECRET = "cloudflare-durable-objects-slack-enterprise-vault-secret-key-32b";

// Helper: ArrayBuffer <-> Hex string
const toHex = (buffer: ArrayBuffer | Uint8Array): string => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const fromHex = (hex: string): Uint8Array => {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
};

/**
 * Derives a deterministic 256-bit AES-GCM key unique to each room/channel.
 */
export const deriveRoomKey = async (roomId: string): Promise<CryptoKey> => {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(MASTER_VAULT_SECRET),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(`room-vault-salt-${roomId}`),
      iterations: 100_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

/**
 * Encrypts plaintext using AES-256-GCM with a cryptographically random 96-bit IV.
 */
export const encryptWithAESGCM = async (
  plaintext: string,
  key: CryptoKey
): Promise<{ readonly ciphertextHex: string; readonly ivHex: string }> => {
  const encoder = new TextEncoder();
  const iv = new Uint8Array(12); // 96-bit IV standard for AES-GCM
  crypto.getRandomValues(iv);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );

  return {
    ciphertextHex: toHex(encryptedBuffer),
    ivHex: toHex(iv),
  };
};

/**
 * Decrypts AES-256-GCM ciphertext using the channel key and IV.
 */
export const decryptWithAESGCM = async (
  ciphertextHex: string,
  ivHex: string,
  key: CryptoKey
): Promise<string> => {
  try {
    const decoder = new TextDecoder();
    const ciphertextBytes = fromHex(ciphertextHex);
    const ivBytes = fromHex(ivHex);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      key,
      ciphertextBytes
    );

    return decoder.decode(decryptedBuffer);
  } catch {
    // If decryption fails or data was not encrypted, return original or fallback
    return "[Encrypted Content]";
  }
};

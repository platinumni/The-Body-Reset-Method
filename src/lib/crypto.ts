// Small crypto helpers built on Web Crypto (available in Workers, no dependencies).

const encoder = new TextEncoder();

export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Unguessable random token, hex encoded. 32 bytes = 256 bits. */
export function randomToken(bytes = 32): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(input: string): Promise<string> {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
}

/** Constant-time string comparison, so attackers can't learn a secret from response timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

// Password hashing: PBKDF2-SHA256 with a per-password random salt.
// 100,000 iterations is the maximum Cloudflare Workers allows. The iteration
// count is stored in the hash so it can be raised later without breaking old hashes.
const PBKDF2_ITERATIONS = 100_000;
const HASH_PREFIX = "pbkdf2_sha256";

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return bytesToHex(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${HASH_PREFIX}$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, iter, saltHex, hash] = stored.split("$");
  const iterations = Number(iter);
  if (prefix !== HASH_PREFIX || !saltHex || !hash || !Number.isInteger(iterations) || iterations < 1) return false;
  return timingSafeEqual(await pbkdf2(password, hexToBytes(saltHex), iterations), hash);
}

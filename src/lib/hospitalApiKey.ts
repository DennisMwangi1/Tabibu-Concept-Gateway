import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_BYTES = 32;

export function generateHospitalApiKey(): string {
  return randomBytes(KEY_BYTES).toString("base64url");
}

export function hashHospitalApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function verifyHospitalApiKey(
  rawKey: string,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash) return false;
  const incoming = hashHospitalApiKey(rawKey);
  const a = Buffer.from(incoming, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

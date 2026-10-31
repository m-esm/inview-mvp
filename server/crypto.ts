import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SCRYPT_KEYLEN = 64

export function hashSecret(value: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(value, salt, SCRYPT_KEYLEN).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifySecret(value: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, expected] = parts
  const actual = scryptSync(value, salt, SCRYPT_KEYLEN).toString('hex')
  try {
    return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function sixDigitCode(): string {
  return String(randomBytes(3).readUIntBE(0, 3) % 1_000_000).padStart(6, '0')
}

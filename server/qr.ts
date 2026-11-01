import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'
import { qrCodes } from '../database/schema'
import { AccountInputError } from './accounts'
import { can, type Principal } from './authz'
import { type GalleryTenant } from './gallery-record'
import { auditActor } from './staff'
import { writeAudit } from './audit'

function multiply(a: number, b: number): number {
  let result = 0
  for (let bit = 7; bit >= 0; bit--) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d)
    result ^= ((b >>> bit) & 1) * a
  }
  return result
}

function parity(data: number[]): number[] {
  const divisor = Array<number>(18).fill(0)
  divisor[17] = 1
  let root = 1
  for (let i = 0; i < 18; i++) {
    for (let j = 0; j < 18; j++) {
      divisor[j] = multiply(divisor[j], root) ^ (divisor[j + 1] ?? 0)
    }
    root = multiply(root, 2)
  }
  const result = Array<number>(18).fill(0)
  for (const byte of data) {
    const factor = byte ^ result.shift()!
    result.push(0)
    for (let i = 0; i < 18; i++) result[i] ^= multiply(divisor[i], factor)
  }
  return result
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.length > 134) throw new AccountInputError('The QR address is too long.')
  const bits: number[] = []
  const append = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  append(4, 4)
  append(bytes.length, 8)
  for (const byte of bytes) append(byte, 8)
  append(0, Math.min(4, 1088 - bits.length))
  while (bits.length % 8) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
  for (let pad = 0; data.length < 136; pad++) data.push(pad % 2 ? 0x11 : 0xec)
  const blocks = [data.slice(0, 68), data.slice(68)]
  const ecc = blocks.map(parity)
  const words: number[] = []
  for (let i = 0; i < 68; i++) for (const block of blocks) words.push(block[i])
  for (let i = 0; i < 18; i++) for (const block of ecc) words.push(block[i])
  const size = 41
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  const reserved = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    modules[y][x] = dark
    reserved[y][x] = true
  }
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [[3, 3], [37, 3], [3, 37]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy))
      set(cx + dx, cy + dy, distance !== 2 && distance !== 4)
    }
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(34 + dx, 34 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  const format = 0x77c4
  const formatBit = (i: number) => ((format >>> i) & 1) !== 0
  for (let i = 0; i <= 5; i++) set(8, i, formatBit(i))
  set(8, 7, formatBit(6))
  set(8, 8, formatBit(7))
  set(7, 8, formatBit(8))
  for (let i = 9; i < 15; i++) set(14 - i, 8, formatBit(i))
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, formatBit(i))
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, formatBit(i))
  set(8, size - 8, true)
  let bit = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vertical = 0; vertical < size; vertical++) {
      const y = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical
      for (let j = 0; j < 2; j++) {
        const x = right - j
        if (reserved[y][x]) continue
        const dark = bit < words.length * 8 && ((words[bit >>> 3] >>> (7 - (bit & 7))) & 1) !== 0
        modules[y][x] = dark !== ((x + y) % 2 === 0)
        bit++
      }
    }
  }
  return modules
}

export function qrSvg(url: string): string {
  const matrix = qrMatrix(url)
  const path = matrix.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`M${x + 4},${y + 4}h1v1h-1z`] : [])).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 49 49" shape-rendering="crispEdges"><rect width="49" height="49" fill="white"/><path d="${path}" fill="black"/></svg>`
}

export function qrUrl(origin: string, slug: string, code: string): string {
  const url = new URL(`/g/${slug}`, origin)
  url.searchParams.set('q', code)
  return url.href
}

export async function createStaffQr(db: AppDatabase, principal: Principal, tenant: GalleryTenant, label: string, origin: string) {
  if (!can(principal, 'create-qr', tenant.gallery.id)) throw new Response('Forbidden', { status: 403 })
  const value = label.trim()
  if (!value || value.length > 120) throw new AccountInputError('Enter a label with up to 120 characters.')
  const code = randomUUID().replaceAll('-', '').slice(0, 16)
  qrSvg(qrUrl(origin, tenant.gallery.slug, code))
  return db.transaction(async (tx) => {
    const [qr] = await tx.insert(qrCodes).values({ showId: tenant.show.id, code, label: value }).returning()
    await writeAudit(tx, { ...auditActor(principal), galleryId: tenant.gallery.id, action: 'create-qr', targetType: 'qr', targetId: qr.id, summary: { ...auditActor(principal).summary, label: value } })
    return qr
  })
}

export async function staffQr(db: AppDatabase, tenant: GalleryTenant, code: string) {
  const [qr] = await db.select({ code: qrCodes.code, label: qrCodes.label }).from(qrCodes).where(and(eq(qrCodes.showId, tenant.show.id), eq(qrCodes.code, code))).limit(1)
  return qr
}

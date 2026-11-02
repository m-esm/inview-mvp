import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { artworks } from '../app/data/gallery.ts'

const publicDir = resolve(import.meta.dirname, '..', 'public')
const START_OF_FRAME = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function jpegSize(bytes: Buffer): { width: number; height: number } {
  let offset = 2
  while (offset < bytes.length) {
    const marker = bytes[offset + 1]
    const length = bytes.readUInt16BE(offset + 2)
    if (START_OF_FRAME.has(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  throw new Error('no JPEG frame header')
}

test('demo artwork width and height match the image files', () => {
  for (const artwork of artworks) {
    const actual = jpegSize(readFileSync(join(publicDir, artwork.image)))
    assert.deepEqual({ width: artwork.width, height: artwork.height }, actual, artwork.image)
  }
})

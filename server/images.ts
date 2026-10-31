import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import type { ObjectStorage } from './storage'

export const VARIANT_WIDTHS = [320, 640, 1280] as const

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp'])

export type ImageVariants = Record<string, string>

export interface ProcessedImage {
  key: string
  width: number
  height: number
  variants: ImageVariants
  primaryUrl: string
}

export async function processAndStoreImage(
  storage: ObjectStorage,
  gallerySlug: string,
  input: Buffer,
  contentType: string,
): Promise<ProcessedImage> {
  if (!ALLOWED.has(contentType)) {
    throw new Error('Use a PNG, JPEG, or WebP image.')
  }
  if (input.byteLength > MAX_BYTES) {
    throw new Error('Use an image smaller than 8 MB.')
  }

  const base = sharp(input).rotate().withMetadata({ exif: {} })
  const meta = await base.metadata()
  if (!meta.width || !meta.height) throw new Error('The image size is not valid.')

  const id = randomUUID()
  const prefix = `galleries/${gallerySlug}/${id}`
  const variants: ImageVariants = {}

  for (const width of VARIANT_WIDTHS) {
    const target = Math.min(width, meta.width)
    for (const format of ['webp', 'jpeg'] as const) {
      const buffer = await sharp(input)
        .rotate()
        .resize({ width: target, withoutEnlargement: true })
        .toFormat(format, { quality: 82 })
        .toBuffer()
      const key = `${prefix}/w${target}.${format}`
      const url = await storage.putObject(key, buffer, `image/${format}`)
      variants[`w${target}.${format}`] = url
    }
  }

  const originalKey = `${prefix}/original.jpg`
  const original = await sharp(input).rotate().jpeg({ quality: 88 }).toBuffer()
  const primaryUrl = await storage.putObject(originalKey, original, 'image/jpeg')

  return {
    key: originalKey,
    width: meta.width,
    height: meta.height,
    variants,
    primaryUrl,
  }
}

export function decodeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([a-z0-9+/=]+)$/i.exec(dataUrl)
  if (!match) return null
  const contentType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase()
  return { buffer: Buffer.from(match[2], 'base64'), contentType }
}

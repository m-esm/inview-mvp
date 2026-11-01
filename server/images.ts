import sharp, { type Metadata } from 'sharp'
import { randomUUID } from 'node:crypto'
import { mediaObjectKey, type ObjectStorage } from './storage'

export const VARIANT_WIDTHS = [320, 640, 1280] as const

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const ACCEPTED_FORMATS = new Set(['png', 'jpeg', 'webp'])

export type ImageVariants = Record<string, string>

export interface ProcessedImage {
  key: string
  width: number
  height: number
  variants: ImageVariants
  primaryUrl: string
}

export function displayVariant(variants: ImageVariants | null | undefined, fallback: string | null = null): string | null {
  const all = variants || {}
  if (all['w640.webp']) return all['w640.webp']
  const webp = Object.keys(all)
    .filter((key) => key.endsWith('.webp'))
    .sort((a, b) => Number(b.slice(1).split('.')[0]) - Number(a.slice(1).split('.')[0]))
  if (webp.length) return all[webp[0]]
  return Object.values(all)[0] || fallback
}

export type UploadErrorCode = 'type' | 'size' | 'broken'

const UPLOAD_MESSAGES: Record<UploadErrorCode, { error: string; errorFa: string }> = {
  type: { error: 'Use a PNG, JPEG, or WebP image.', errorFa: 'یک تصویر PNG، JPEG یا WebP انتخاب کنید.' },
  size: { error: 'Use an image smaller than 8 MB.', errorFa: 'تصویری کوچک‌تر از ۸ مگابایت انتخاب کنید.' },
  broken: { error: 'That image could not be read.', errorFa: 'این تصویر خوانده نشد.' },
}

export class UploadError extends Error {
  readonly code: UploadErrorCode
  readonly errorFa: string

  constructor(code: UploadErrorCode) {
    super(UPLOAD_MESSAGES[code].error)
    this.code = code
    this.errorFa = UPLOAD_MESSAGES[code].errorFa
  }
}

export async function sniffImageFormat(input: Buffer): Promise<'png' | 'jpeg' | 'webp'> {
  let format: string | undefined
  try {
    format = (await sharp(input).metadata()).format
  } catch {
    throw new UploadError('type')
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) throw new UploadError('type')
  return format as 'png' | 'jpeg' | 'webp'
}

export async function processAndStoreImage(
  storage: ObjectStorage,
  gallerySlug: string,
  input: Buffer,
): Promise<ProcessedImage> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new UploadError('size')
  await sniffImageFormat(input)

  let meta: Metadata
  try {
    meta = await sharp(input).rotate().metadata()
  } catch {
    throw new UploadError('broken')
  }
  if (!meta.width || !meta.height) throw new UploadError('broken')

  const id = randomUUID()
  const prefix = mediaObjectKey(gallerySlug, id)
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

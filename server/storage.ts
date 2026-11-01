import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { Request, Response, NextFunction } from 'express'

export interface ObjectStorage {
  putObject(key: string, body: Buffer, contentType: string): Promise<string>
  publicUrl(key: string): string
}

export function publicObjectUrl(base: string, key: string): string {
  const root = base.replace(/\/+$/, '')
  const clean = key.replace(/^\/+/, '')
  return `${root}/${clean}`
}

// Garage on inview-media serves /inview/<key> and the route allows only /inview/u/.
export function mediaObjectKey(
  gallerySlug: string,
  imageId: string,
  objectPrefix?: string,
): string {
  const raw = objectPrefix === undefined ? process.env.S3_OBJECT_PREFIX : objectPrefix
  const prefix = (raw === undefined ? 'u' : raw).replace(/^\/+|\/+$/g, '')
  const rest = `galleries/${gallerySlug}/${imageId}`
  return prefix ? `${prefix}/${rest}` : rest
}

export class LocalObjectStorage implements ObjectStorage {
  constructor(
    private readonly rootDir: string,
    private readonly publicBase = '/media',
  ) {
    mkdirSync(rootDir, { recursive: true })
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    const full = path.join(this.rootDir, key)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, body)
    void contentType
    return this.publicUrl(key)
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${key.split(path.sep).join('/')}`
  }
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client

  constructor(
    private readonly bucket: string,
    private readonly publicBase: string,
    endpoint: string | undefined,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: Boolean(endpoint),
      credentials: { accessKeyId, secretAccessKey },
    })
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )
    return this.publicUrl(key)
  }

  publicUrl(key: string): string {
    return publicObjectUrl(this.publicBase, key)
  }
}

export function createObjectStorage(): ObjectStorage {
  const bucket = process.env.S3_BUCKET
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  const publicHost = process.env.S3_PUBLIC_HOST || 'inview-media.moshes.io'
  if (bucket && accessKeyId && secretAccessKey) {
    const publicBase = (process.env.S3_PUBLIC_BASE || `https://${publicHost}/${bucket}`).replace(/\/+$/, '')
    return new S3ObjectStorage(
      bucket,
      publicBase,
      process.env.S3_ENDPOINT,
      process.env.S3_REGION || 'us-east-1',
      accessKeyId,
      secretAccessKey,
    )
  }
  const root = process.env.MEDIA_DIR || path.join(process.cwd(), '.data', 'media')
  return new LocalObjectStorage(root)
}

export function localMediaMiddleware(rootDir = process.env.MEDIA_DIR || path.join(process.cwd(), '.data', 'media')) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/media/')) return next()
    const key = req.path.slice('/media/'.length)
    if (!key || key.includes('..')) {
      res.status(400).end('Bad path')
      return
    }
    const full = path.join(rootDir, key)
    if (!existsSync(full)) {
      res.status(404).end('Not found')
      return
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    createReadStream(full).pipe(res)
  }
}

import busboy from 'busboy'
import type { Request } from 'express'
import { MAX_UPLOAD_BYTES, UploadError } from './images'

export interface UploadBody {
  fields: Record<string, string>
  file: Buffer | null
}

export function isMultipart(req: Request): boolean {
  return /^multipart\/form-data/i.test(req.get('content-type') || '')
}

export function readMultipart(req: Request): Promise<UploadBody> {
  return new Promise((resolve, reject) => {
    let parser: busboy.Busboy
    try {
      parser = busboy({
        headers: req.headers,
        limits: { files: 1, fields: 8, fieldSize: 1024, fileSize: MAX_UPLOAD_BYTES },
      })
    } catch {
      reject(new UploadError('broken'))
      return
    }
    const fields: Record<string, string> = {}
    let file: Buffer | null = null
    let tooLarge = false
    parser.on('field', (name, value) => {
      fields[name] = value
    })
    parser.on('file', (_name, stream) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('limit', () => {
        tooLarge = true
      })
      stream.on('end', () => {
        file = Buffer.concat(chunks)
      })
    })
    parser.on('error', () => reject(new UploadError('broken')))
    parser.on('close', () => {
      if (tooLarge) reject(new UploadError('size'))
      else resolve({ fields, file })
    })
    req.pipe(parser)
  })
}

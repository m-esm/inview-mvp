import { handlePilot } from '../server/pilot-store.mjs'

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body)
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return null
  return JSON.parse(raw)
}

export default async function handler(req, res) {
  try {
    const method = req.method || 'GET'
    let body = null
    if (method !== 'GET' && method !== 'HEAD') body = await readBody(req)
    const result = await handlePilot(method, body)
    res.setHeader('Cache-Control', 'no-store')
    res.status(result.status).json(result.body)
  } catch {
    res.status(400).json({ error: 'Invalid JSON.' })
  }
}

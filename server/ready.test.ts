import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import express from 'express'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import { sendReady } from './ready.ts'

async function listen(app) {
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server has no port.')
  return { server, port: address.port }
}

async function pingClosedPort() {
  const client = postgres('postgres://inview:inview@127.0.0.1:1/inview', {
    max: 1,
    connect_timeout: 1,
  })
  try {
    await drizzle(client).execute(sql`select 1`)
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined)
  }
}

test('GET /api/v1/ready returns 503 when the database is not reachable', async () => {
  const app = express()
  app.get('/api/v1/ready', (_req, res) => {
    void sendReady(res, {
      draining: false,
      db: pingClosedPort,
      storage: async () => {},
    })
  })
  const { server, port } = await listen(app)
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/ready`)
    const body = await response.json()
    assert.equal(response.status, 503)
    assert.equal(body.ok, false)
    assert.equal(body.checks.db, 'down')
    assert.equal(body.checks.storage, 'ok')
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)))
  }
})

test('GET /api/v1/ready returns 200 when both checks pass', async () => {
  const app = express()
  app.get('/api/v1/ready', (_req, res) => {
    void sendReady(res, {
      draining: false,
      db: async () => {},
      storage: async () => {},
    })
  })
  const { server, port } = await listen(app)
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/ready`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.ok, true)
    assert.deepEqual(body.checks, { db: 'ok', storage: 'ok' })
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)))
  }
})

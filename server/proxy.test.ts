import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { trustClusterProxy } from './proxy.js'

function protocolApp() {
  const app = trustClusterProxy(express())
  app.get('/proto', (req, res) => {
    res.json({ protocol: req.protocol, origin: `${req.protocol}://${req.get('host')}` })
  })
  return app
}

test('a request through the cluster proxy keeps its https origin', async () => {
  const res = await request(protocolApp())
    .get('/proto')
    .set('Host', 'inview.moshes.io')
    .set('X-Forwarded-Proto', 'https')
  assert.equal(res.body.protocol, 'https')
  assert.equal(res.body.origin, 'https://inview.moshes.io')
})

test('without a forwarded protocol the request stays http', async () => {
  const res = await request(protocolApp()).get('/proto').set('Host', 'inview.moshes.io')
  assert.equal(res.body.protocol, 'http')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseContext, type AppDatabase } from '../database/context'
import { createUser, createUserSession } from './accounts'
import { createTestDb } from './test-db'
import { loader as shell } from '../app/routes/ops'
import { loader as overview } from '../app/routes/ops._index'
import { loader as newGallery, action as create } from '../app/routes/ops.galleries.new'
import { loader as profile, action as update } from '../app/routes/ops.galleries.profile'
import { loader as team, action as editTeam } from '../app/routes/ops.galleries.team'
import { action as signOut } from '../app/routes/ops.sign-out'
import { loader as csv } from '../app/routes/ops.galleries.leads-csv'
import type { AppLoadContext } from 'react-router'

test('each operator loader and action redirects anonymous visitors and rejects staff', async () => {
  const fixture = await createTestDb()
  const db = fixture.db as unknown as AppDatabase
  try {
    const user = await createUser(db, { email: 'staff@example.com', password: 'long-password' })
    const session = await createUserSession(db, user.id, false)
    for (const [cookie, status] of [['', 302], [session.cookie, 403]] as const) {
      const request = new Request('http://localhost/ops', { headers: { cookie } })
      const args = { request, params: { slug: 'unavailable' }, context: {} as AppLoadContext }
      for (const handler of [shell, overview, newGallery, profile, team, create, update, editTeam, signOut, csv]) {
        await assert.rejects(DatabaseContext.run(db, () => handler(args)), (error: unknown) => {
          assert.ok(error instanceof Response)
          assert.equal(error.status, status)
          if (status === 302) assert.equal(error.headers.get('location'), '/ops/sign-in')
          return true
        })
      }
    }
  } finally { await fixture.close() }
})

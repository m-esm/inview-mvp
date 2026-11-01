import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createOperatorInvite, runCreateOperator } from '../scripts/create-operator.mjs'
import { auditLogs, invitations, users } from '../database/schema'
import { sha256 } from './crypto'
import { acceptInvite } from './invitations'
import { createTestDb } from './test-db'
import type { AppDatabase } from '../database/context'

test('plain ESM operator script core uses PGlite, prints exactly one URL and creates an acceptable invite', async () => {
  const fixture = await createTestDb()
  try {
    function adapter(client: Pick<typeof fixture.client, 'query' | 'transaction'>) {
      const tagged = async (parts: TemplateStringsArray, ...values: unknown[]) => {
        const query = parts.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, '')
        return (await client.query(query, values.map((value) => value instanceof Date ? value.toISOString() : value))).rows
      }
      return Object.assign(tagged, {
        begin: (callback: (tx: ReturnType<typeof adapter>) => Promise<unknown>) => client.transaction((tx) => callback(adapter(tx))),
        end: async () => {},
      })
    }
    const sql = adapter(fixture.client)
    let stdout = ''
    await runCreateOperator(['--email', 'ADMIN@Example.com', '--name', 'Admin', '--role', 'admin'],
      { DATABASE_URL: 'test', PUBLIC_APP_URL: 'https://app.example.com/' }, () => sql, (line: string) => { stdout += line })
    assert.match(stdout, /^https:\/\/app\.example\.com\/staff\/invite\/[A-Za-z0-9_-]{43}\n$/)
    assert.equal(stdout.trim().split('\n').length, 1)
    const token = new URL(stdout.trim()).pathname.split('/').at(-1)!
    const [user] = await fixture.db.select().from(users)
    assert.equal(user.email, 'admin@example.com')
    assert.equal(user.platformRole, 'admin')
    assert.equal(user.status, 'invited')
    assert.equal(user.passwordHash, null)
    const [invite] = await fixture.db.select().from(invitations)
    assert.equal(invite.kind, 'operator')
    assert.equal(invite.userId, user.id)
    assert.equal(invite.tokenHash, sha256(token))
    assert.equal((await fixture.db.select().from(auditLogs))[0].action, 'invite-create')
    await acceptInvite(fixture.db as unknown as AppDatabase, token, 'Admin', 'long-password')
    await assert.rejects(createOperatorInvite(sql, { email: 'admin@example.com', name: 'Duplicate', role: 'support', publicAppUrl: 'https://app.example.com' }))
    assert.equal((await fixture.db.select().from(users)).length, 1)
    assert.equal((await fixture.db.select().from(invitations)).length, 1)
    await assert.rejects(createOperatorInvite(sql, { email: 'bad@example.com', name: 'Invalid', role: 'owner', publicAppUrl: 'https://app.example.com' }))
    const result = spawnSync(process.execPath, ['scripts/create-operator.mjs'], {
      encoding: 'utf8', env: { PATH: process.env.PATH, PUBLIC_APP_URL: 'https://app.example.com' },
    })
    assert.equal(result.status, 1)
    assert.equal(result.stdout, '')
    assert.match(result.stderr, /^Could not create the operator invite\./)
  } finally {
    await fixture.close()
  }
})

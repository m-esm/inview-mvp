import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

test('migration 0006 preserves old rows, adds safe defaults, tables and indexes and permits null phones', async () => {
  const client = new PGlite()
  try {
    const directory = new URL('../drizzle/', import.meta.url)
    const files = readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()
    for (const file of files.filter((name) => !name.startsWith('0006_'))) {
      for (const statement of readFileSync(new URL(file, directory), 'utf8').split('--> statement-breakpoint').filter((part) => part.trim())) {
        await client.exec(statement)
      }
    }
    await client.exec("INSERT INTO users (phone) VALUES ('09120000000')")
    await client.exec("INSERT INTO galleries (slug, name_en, name_fa) VALUES ('old-gallery', 'Old', 'Old')")
    for (const statement of readFileSync(new URL('0006_users_roles_audit.sql', directory), 'utf8').split('--> statement-breakpoint').filter((part) => part.trim())) {
      await client.exec(statement)
    }
    const user = (await client.query('SELECT * FROM users')).rows[0] as Record<string, unknown>
    assert.equal(user.status, 'active')
    assert.equal(user.name, '')
    assert.equal(user.email, null)
    assert.equal(user.password_hash, null)
    assert.equal(user.platform_role, null)
    assert.equal(user.last_signed_in_at, null)
    assert.ok(user.updated_at)
    const gallery = (await client.query('SELECT * FROM galleries')).rows[0] as Record<string, unknown>
    assert.equal(gallery.status, 'live')
    assert.equal(gallery.notes, '')
    assert.equal(gallery.shared_code_enabled, true)
    await client.exec("INSERT INTO users (email) VALUES ('Mixed@example.com'), ('other@example.com')")
    await assert.rejects(client.exec("INSERT INTO users (email) VALUES ('MIXED@example.com')"))
    await assert.rejects(client.exec("INSERT INTO users (phone) VALUES ('09120000000')"))
    assert.equal((await client.query('SELECT created_by FROM memberships')).rows.length, 0)
    assert.equal((await client.query('SELECT * FROM invitations')).rows.length, 0)
    assert.equal((await client.query('SELECT * FROM audit_logs')).rows.length, 0)
    const indexes = (await client.query('SELECT indexname FROM pg_indexes')).rows.map((row) => (row as { indexname: string }).indexname)
    for (const index of ['users_email_uidx', 'users_phone_uidx', 'sessions_user_id_idx', 'invitations_token_hash_uidx', 'audit_logs_gallery_created_idx', 'audit_logs_actor_created_idx']) {
      assert.ok(indexes.includes(index), index)
    }
  } finally {
    await client.close()
  }
})

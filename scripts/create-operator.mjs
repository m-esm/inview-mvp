import { createHash, randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

export async function createOperatorInvite(sql, opts) {
  const email = String(opts.email ?? '').trim().toLowerCase()
  const name = String(opts.name ?? '').trim()
  const role = opts.role
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320 || !name || name.length > 200
    || !['admin', 'support'].includes(role)) throw new Error('Invalid operator details.')
  const appUrl = new URL(opts.publicAppUrl)
  if (!['https:', 'http:'].includes(appUrl.protocol) || appUrl.username || appUrl.password
    || appUrl.search || appUrl.hash) throw new Error('Invalid PUBLIC_APP_URL.')
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await sql.begin(async (tx) => {
    const [user] = await tx`
      INSERT INTO users (email, name, platform_role, status)
      VALUES (${email}, ${name}, ${role}, 'invited') RETURNING id
    `
    const [invite] = await tx`
      INSERT INTO invitations (token_hash, kind, platform_role, user_id, expires_at)
      VALUES (${tokenHash}, 'operator', ${role}, ${user.id}, ${expiresAt}) RETURNING id
    `
    await tx`
      INSERT INTO audit_logs (action, target_type, target_id, summary)
      VALUES ('invite-create', 'invitation', ${invite.id}, ${JSON.stringify({ kind: 'operator', platformRole: role })}::jsonb)
    `
  })
  return `${appUrl.href.replace(/\/$/, '')}/staff/invite/${token}`
}

export async function runCreateOperator(argv, env, connect = postgres, write = (line) => process.stdout.write(line)) {
  if (!env.DATABASE_URL || !env.PUBLIC_APP_URL) throw new Error('DATABASE_URL and PUBLIC_APP_URL are required.')
  const options = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!['--email', '--name', '--role'].includes(key) || !value || Object.hasOwn(options, key.slice(2))) {
      throw new Error('Use --email, --name and --role admin|support.')
    }
    options[key.slice(2)] = value
  }
  const sql = connect(env.DATABASE_URL, { max: 1, onnotice: () => {} })
  try {
    const url = await createOperatorInvite(sql, { ...options, publicAppUrl: env.PUBLIC_APP_URL })
    write(`${url}\n`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runCreateOperator(process.argv.slice(2), process.env)
  } catch {
    process.stderr.write('Could not create the operator invite. Check the arguments and database configuration.\n')
    process.exitCode = 1
  }
}

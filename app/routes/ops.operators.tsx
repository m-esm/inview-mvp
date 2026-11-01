import { Form, useActionData, useLoaderData } from 'react-router'
import { database } from '../../database/context'
import type { PlatformRole } from '../../server/authz'
import { AccountInputError } from '../../server/accounts'
import { inviteOperator, listOperators, requireOperatorAdmin, updateOperator } from '../../server/ops-admin'
import { OneTimeValue, OpsSubmit } from '../components/OpsUi'
import { useOpsT } from '../lib/i18n-ops'
import { actionFailure, field, operatorFor, privateHeaders, requireOrigin } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request }: { request: Request }) {
  const principal = await operatorFor(request)
  try {
    requireOperatorAdmin(principal)
  } catch { throw new Response('Forbidden', { status: 403, headers: privateHeaders() }) }
  return { operators: await listOperators(database(), principal), self: principal.userId }
}
export async function action({ request }: { request: Request }) {
  const principal = await operatorFor(request)
  requireOrigin(request)
  try {
    requireOperatorAdmin(principal)
    const form = await request.formData()
    const intent = field(form, 'intent')
    if (intent === 'invite') return { error: false, saved: false, ...await inviteOperator(database(), principal, field(form, 'identifier'), field(form, 'role') as PlatformRole) }
    if (!['role', 'disable'].includes(intent)) throw new AccountInputError('Invalid action.')
    await updateOperator(database(), principal, field(form, 'userId'), intent === 'role' ? { role: field(form, 'role') as PlatformRole } : { disable: true })
    return { error: false, saved: true, invitePath: null }
  } catch (error) { return actionFailure(error) }
}

function OperatorRole({ value = 'support' }: { value?: string }) {
  const { t } = useOpsT()
  return <label>{t.role}<select name="role" defaultValue={value}><option value="support">{t.support}</option><option value="admin">{t.admin}</option></select></label>
}

export default function Operators() {
  const { operators, self } = useLoaderData<typeof loader>()
  const result = useActionData<typeof action>()
  const { t, format } = useOpsT()
  return <><h1>{t.operators}</h1>
    {result?.error && <p role="alert">{t.invalidFields}</p>}{result?.saved && <p role="status">{t.saved}</p>}
    {result?.invitePath && <OneTimeValue value={result.invitePath} label={t.inviteLink} />}
    <section><h2>{t.inviteOperator}</h2><Form method="post" className="ops-form">
      <label>{t.identifier}<input name="identifier" required maxLength={320} dir="ltr" autoComplete="off" /></label>
      <OperatorRole /><OpsSubmit name="intent" value="invite">{t.inviteOperator}</OpsSubmit>
    </Form></section>
    <div className="ops-team">{operators.map((operator) => <section key={operator.id} className="ops-member">
      <h2>{operator.name || t.invited}</h2><p>{operator.role ? t[operator.role] : ''} · {t[operator.status]}</p>
      <p>{t.lastSignIn}: {operator.lastSignedInAt ? format.dateTime(String(operator.lastSignedInAt)) : t.never}</p>
      {operator.id !== self && <Form method="post"><input type="hidden" name="userId" value={operator.id} /><OperatorRole value={operator.role || 'support'} />
        <div className="ops-actions"><OpsSubmit name="intent" value="role">{t.changeRole}</OpsSubmit><OpsSubmit name="intent" value="disable">{t.disable}</OpsSubmit></div>
      </Form>}
    </section>)}</div>
  </>
}

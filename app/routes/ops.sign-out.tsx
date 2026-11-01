import { redirect } from 'react-router'
import { database } from '../../database/context'
import { signOut } from '../../server/accounts'
import { secureFrom } from './staff-session.server'
import { operatorFor, privateHeaders, requireOrigin } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request }: { request: Request }) {
  await operatorFor(request)
  return redirect('/ops')
}
export async function action({ request }: { request: Request }) {
  await operatorFor(request)
  requireOrigin(request)
  return redirect('/ops/sign-in', { headers: { ...privateHeaders(), 'Set-Cookie': await signOut(database(), request.headers.get('cookie'), secureFrom(request)) } })
}

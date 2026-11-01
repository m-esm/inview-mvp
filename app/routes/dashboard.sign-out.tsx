import { redirect } from 'react-router'
import { signOutAction } from './staff-session.server'

export function headers() {
  return { 'Cache-Control': 'no-store' }
}

export function loader() {
  return redirect('/dashboard/sign-in')
}

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed.', { status: 405 })
  }
  const result = await signOutAction(request)
  return redirect(result.location, { headers: { 'Set-Cookie': result.cookie } })
}

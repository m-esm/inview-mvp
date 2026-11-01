import { redirect } from 'react-router'
import { signOutAction } from './staff-session.server'

export function headers() {
  return { 'Cache-Control': 'no-store' }
}

export function loader() {
  return redirect('/staff/sign-in')
}

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed.', { status: 405 })
  }
  const result = await signOutAction(request)
  const headers = new Headers({ 'Cache-Control': 'no-store' })
  for (const cookie of result.cookies) headers.append('Set-Cookie', cookie)
  return redirect(result.location, { headers })
}

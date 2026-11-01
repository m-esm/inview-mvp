import { data, redirect, useActionData } from 'react-router'
import { StaffSignIn, type SignInError } from '../pages/gallery/StaffSignIn'
import { redirectIfSignedIn, signInAction } from './staff-session.server'

export function headers() {
  return { 'Cache-Control': 'no-store' }
}

export async function loader({ request }: { request: Request }) {
  return (await redirectIfSignedIn(request)) ?? null
}

export async function action({ request, context }: { request: Request; context: { clientIp?: string } }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed.', { status: 405 })
  }
  const result = await signInAction(request, context.clientIp)
  if (!result.ok) {
    const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
    if (result.retryAfterSeconds) headers['Retry-After'] = String(result.retryAfterSeconds)
    const error: SignInError = result.status === 429 ? 'limited' : 'wrong'
    return data({ error }, { status: result.status, headers })
  }
  return redirect(result.location, { headers: { 'Set-Cookie': result.cookie } })
}

export default function StaffSignInRoute() {
  const result = useActionData() as { error?: SignInError } | undefined
  return <StaffSignIn error={result?.error} />
}

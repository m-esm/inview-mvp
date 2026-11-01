import { data, redirect, useActionData } from 'react-router'
import { StaffSignIn } from '~/pages/gallery/StaffSignIn'
import { redirectIfSignedIn, signInAction } from './staff-session.server'

export function headers() {
  return { 'Cache-Control': 'no-store' }
}

export async function loader({ request }: { request: Request }) {
  return (await redirectIfSignedIn(request)) ?? null
}

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed.', { status: 405 })
  }
  const result = await signInAction(request)
  if (!result.ok) return data({ error: result.error }, { status: 401 })
  return redirect(result.location, { headers: { 'Set-Cookie': result.cookie } })
}

export default function DashboardSignIn() {
  const result = useActionData() as { error?: string } | undefined
  return <StaffSignIn error={result?.error} />
}

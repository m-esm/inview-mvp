import { database } from '../../database/context'
import {
  anonymousEditorGate,
  completeSignOut,
  readStaffSession,
  requestIsSecure,
  signedIn,
} from '../../server/staff-session'
import { runSignIn } from '../../server/rate-limit'

export function secureFrom(request: Request): boolean {
  return requestIsSecure((name) => request.headers.get(name), request.url)
}

export async function guardOGallery(request: Request): Promise<Response | null> {
  const session = await readStaffSession(database(), request.headers.get('cookie'))
  return anonymousEditorGate(session)
}

export async function redirectIfSignedIn(request: Request): Promise<Response | null> {
  const session = await readStaffSession(database(), request.headers.get('cookie'))
  if (!session) return null
  return new Response(null, {
    status: 302,
    headers: { Location: '/dashboard/o-gallery', 'Cache-Control': 'no-store' },
  })
}

export async function signInAction(request: Request, clientIp = 'unknown') {
  const form = await request.formData()
  const code = String(form.get('accessCode') || '')
  const result = await runSignIn(database(), code, clientIp)
  if (!result.ok) {
    const body = result.result.body as { error?: string }
    return {
      ok: false as const,
      status: result.result.status,
      error: body.error || 'That access code does not match.',
      retryAfterSeconds: result.result.retryAfterSeconds,
    }
  }
  return signedIn(result.token, secureFrom(request))
}

export async function signOutAction(request: Request) {
  return completeSignOut(database(), request.headers.get('cookie'), secureFrom(request))
}

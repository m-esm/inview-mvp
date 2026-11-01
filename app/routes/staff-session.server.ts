import { database } from '../../database/context'
import {
  anonymousEditorGate,
  completeSignIn,
  completeSignOut,
  readStaffSession,
  requestIsSecure,
} from '../../server/staff-session'

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

export async function signInAction(request: Request) {
  const form = await request.formData()
  const code = String(form.get('accessCode') || '')
  return completeSignIn(database(), code, secureFrom(request))
}

export async function signOutAction(request: Request) {
  return completeSignOut(database(), request.headers.get('cookie'), secureFrom(request))
}

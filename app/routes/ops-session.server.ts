import { data, redirect } from 'react-router'
import { database } from '../../database/context'
import { principalFor } from '../../server/authz'
import { galleryProfile } from '../../server/ops'
import { AccountInputError } from '../../server/accounts'
import { PermissionError } from '../../server/team'

export function privateHeaders() {
  return { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' }
}

export async function operatorFor(request: Request) {
  const principal = await principalFor(database(), request)
  if (!principal) throw redirect('/ops/sign-in', { headers: privateHeaders() })
  if (principal.kind !== 'operator') throw new Response('Forbidden', { status: 403, headers: privateHeaders() })
  return principal
}

export async function operatorGallery(request: Request, slug: string) {
  const principal = await operatorFor(request)
  const gallery = await galleryProfile(database(), principal, slug)
  if (!gallery) throw new Response('Not found', { status: 404, headers: privateHeaders() })
  return { principal, gallery }
}

export function requireOrigin(request: Request) {
  const expected = new URL(process.env.PUBLIC_APP_URL || request.url).origin
  if (request.headers.get('origin') !== expected) throw new Response('Forbidden', { status: 403, headers: privateHeaders() })
}

export function actionFailure(error: unknown) {
  if (error instanceof PermissionError) throw new Response('Forbidden', { status: 403, headers: privateHeaders() })
  if (error instanceof AccountInputError) return data({ error: true, invitePath: null, code: null, slug: null, saved: false }, { status: 400, headers: privateHeaders() })
  throw new Response('The request failed.', { status: 500, headers: privateHeaders() })
}

export function field(form: FormData, name: string) {
  return String(form.get(name) ?? '')
}

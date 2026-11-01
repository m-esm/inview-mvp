import { Form, data, useActionData, useLoaderData } from 'react-router'
import { database } from '../../database/context'
import type { MembershipRole } from '../../server/authz'
import { AccountInputError } from '../../server/accounts'
import { changeRole, disableUser, enableUser, inviteStaff, listTeam, PermissionError, removeMembership, resetLink, signOutUser } from '../../server/team'
import { staffHeaders, staffTenant } from '../../server/staff'
import { useStaffT } from '../lib/i18n-staff'
import { GalleryStaffLayout } from '../pages/gallery/GalleryStaffLayout'
import { requireStaffOrigin } from './staff-session.server'

export const headers = staffHeaders
export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  const { principal, tenant } = await staffTenant(database(), request, params.slug ?? '', 'manage-staff')
  return { gallery: { slug: tenant.gallery.slug, nameEn: tenant.gallery.nameEn, nameFa: tenant.gallery.nameFa }, team: await listTeam(database(), principal, tenant.gallery.id) }
}
export async function action({ request, params }: { request: Request; params: { slug?: string } }) {
  const { principal, tenant } = await staffTenant(database(), request, params.slug ?? '', 'manage-staff')
  requireStaffOrigin(request)
  const form = await request.formData()
  const field = (name: string) => String(form.get(name) ?? '')
  const db = database()
  const galleryId = tenant.gallery.id
  const userId = field('userId')
  const intent = field('intent')
  try {
    if (intent === 'invite') return { error: false, saved: false, ...await inviteStaff(db, principal, galleryId, field('role') as MembershipRole, field('identifier')) }
    if (!/^[0-9a-f-]{36}$/.test(userId)) throw new AccountInputError('Invalid user.')
    if (intent === 'reset') return { error: false, saved: false, ...await resetLink(db, principal, galleryId, userId) }
    if (intent === 'role') await changeRole(db, principal, galleryId, userId, field('role') as MembershipRole)
    else if (intent === 'disable') await disableUser(db, principal, galleryId, userId)
    else if (intent === 'enable') await enableUser(db, principal, galleryId, userId)
    else if (intent === 'remove') await removeMembership(db, principal, galleryId, userId)
    else if (intent === 'sign-out') await signOutUser(db, principal, galleryId, userId)
    else throw new AccountInputError('Invalid action.')
    return { error: false, saved: true, invitePath: null }
  } catch (error) {
    if (error instanceof PermissionError) throw new Response('Forbidden', { status: 403, headers: staffHeaders() })
    if (error instanceof AccountInputError) return data({ error: true, saved: false, invitePath: null }, { status: 400, headers: staffHeaders() })
    throw error
  }
}
function RoleSelect({ value = 'editor' }: { value?: MembershipRole }) {
  const { t } = useStaffT()
  return <label>{t.role}<select name="role" defaultValue={value}>{(['owner', 'editor', 'viewer'] as const).map((role) => <option key={role} value={role}>{t[role]}</option>)}</select></label>
}
export default function StaffTeam() {
  const { gallery, team } = useLoaderData<typeof loader>()
  const result = useActionData<typeof action>()
  const { t } = useStaffT()
  return <GalleryStaffLayout gallery={gallery} permissions={['edit-catalogue', 'manage-staff', 'create-qr']} titleKey="team">
    {result?.error && <p role="alert">{t.requestFailed}</p>}{result?.saved && <p role="status">{t.saved}</p>}
    {result?.invitePath && <label>{t.inviteLink}<input readOnly value={result.invitePath} dir="ltr" onFocus={(event) => event.currentTarget.select()} /></label>}
    <Form method="post"><label>{t.identifier}<input name="identifier" required maxLength={320} dir="ltr" /></label><RoleSelect /><button type="submit" name="intent" value="invite">{t.invite}</button></Form>
    {team.map((member) => <section key={member.userId}><h2>{member.name}</h2><p>{t[member.role]}</p><Form method="post"><input type="hidden" name="userId" value={member.userId} /><RoleSelect value={member.role} />
      {(['role', member.status === 'disabled' ? 'enable' : 'disable', 'remove', 'reset', 'sign-out'] as const).map((intent) => <button type="submit" name="intent" value={intent} key={intent}>{intent === 'role' ? t.changeRole : intent === 'sign-out' ? t.signOutUser : t[intent]}</button>)}
    </Form></section>)}{!team.length && <p>{t.noTeam}</p>}
  </GalleryStaffLayout>
}

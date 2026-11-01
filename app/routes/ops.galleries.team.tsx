import { Form, useActionData, useLoaderData } from 'react-router'
import { database } from '../../database/context'
import type { MembershipRole } from '../../server/authz'
import { AccountInputError } from '../../server/accounts'
import { changeRole, disableUser, enableUser, inviteStaff, listTeam, removeMembership, resetLink, signOutUser } from '../../server/team'
import { GalleryLinks, OneTimeValue, OpsSubmit, RoleSelect } from '../components/OpsUi'
import { useOpsT } from '../lib/i18n-ops'
import { actionFailure, field, operatorGallery, privateHeaders, requireOrigin } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  const { principal, gallery } = await operatorGallery(request, params.slug ?? '')
  return { gallery, team: await listTeam(database(), principal, gallery.id) }
}
export async function action({ request, params }: { request: Request; params: { slug?: string } }) {
  const { principal, gallery } = await operatorGallery(request, params.slug ?? '')
  requireOrigin(request)
  const form = await request.formData()
  const db = database()
  const userId = field(form, 'userId')
  const intent = field(form, 'intent')
  try {
    if (intent === 'invite') return { error: false, saved: false, ...await inviteStaff(db, principal, gallery.id, field(form, 'role') as MembershipRole, field(form, 'identifier')) }
    if (!/^[0-9a-f-]{36}$/.test(userId)) throw new AccountInputError('Invalid user.')
    if (intent === 'reset') return { error: false, saved: false, ...await resetLink(db, principal, gallery.id, userId) }
    if (intent === 'role') await changeRole(db, principal, gallery.id, userId, field(form, 'role') as MembershipRole)
    else if (intent === 'disable') await disableUser(db, principal, gallery.id, userId)
    else if (intent === 'enable') await enableUser(db, principal, gallery.id, userId)
    else if (intent === 'remove') await removeMembership(db, principal, gallery.id, userId)
    else if (intent === 'sign-out') await signOutUser(db, principal, gallery.id, userId)
    else throw new AccountInputError('Invalid action.')
    return { error: false, saved: true, invitePath: null }
  } catch (error) { return actionFailure(error) }
}

export default function GalleryTeam() {
  const { gallery, team } = useLoaderData<typeof loader>()
  const result = useActionData<typeof action>()
  const { t, lang, format } = useOpsT()
  return <><p className="ops-eyebrow">{lang === 'fa' ? gallery.nameFa : gallery.nameEn}</p><h1>{t.team}</h1><GalleryLinks slug={gallery.slug} />
    {result?.error && <p className="error" role="alert">{t.teamError}</p>}{result?.saved && <p role="status">{t.saved}</p>}
    {result?.invitePath && <OneTimeValue value={result.invitePath} label={t.inviteLink} />}
    <section className="ops-section"><h2>{t.invite}</h2><Form method="post" className="ops-form">
      <label>{t.identifier}<input name="identifier" required maxLength={320} dir="ltr" autoComplete="off" /></label><RoleSelect />
      <OpsSubmit name="intent" value="invite">{t.invite}</OpsSubmit>
    </Form></section>
    <div className="ops-team">{team.map((member) => <section key={member.userId} className="ops-member">
      <h2>{member.name || t.invited}</h2><p>{t[member.status]} · {member.role === 'editor' ? t.editorRole : t[member.role]}</p>
      <p>{t.lastSignIn}: {member.lastSignedInAt ? format.dateTime(String(member.lastSignedInAt)) : t.never}</p>
      <Form method="post"><input type="hidden" name="userId" value={member.userId} /><RoleSelect value={member.role} />
        <div className="ops-actions"><OpsSubmit name="intent" value="role">{t.changeRole}</OpsSubmit>
          <OpsSubmit name="intent" value={member.status === 'disabled' ? 'enable' : 'disable'}>{member.status === 'disabled' ? t.enable : t.disable}</OpsSubmit>
          <OpsSubmit name="intent" value="remove">{t.remove}</OpsSubmit><OpsSubmit name="intent" value="reset">{t.reset}</OpsSubmit><OpsSubmit name="intent" value="sign-out">{t.signOutUser}</OpsSubmit>
        </div>
      </Form>
    </section>)}</div>{!team.length && <p>{t.noRows}</p>}
  </>
}

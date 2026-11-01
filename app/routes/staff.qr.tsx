import { eq } from 'drizzle-orm'
import { Form, data, useActionData, useLoaderData } from 'react-router'
import { database } from '../../database/context'
import { qrCodes } from '../../database/schema'
import { AccountInputError } from '../../server/accounts'
import { createStaffQr } from '../../server/qr'
import { staffHeaders, staffTenant } from '../../server/staff'
import { can } from '../../server/authz'
import { useStaffT } from '../lib/i18n-staff'
import { GalleryStaffLayout } from '../pages/gallery/GalleryStaffLayout'
import { requireStaffOrigin } from './staff-session.server'

export const headers = staffHeaders
export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  const db = database()
  const { principal, tenant } = await staffTenant(db, request, params.slug ?? '', 'create-qr')
  const codes = await db.select({ code: qrCodes.code, label: qrCodes.label }).from(qrCodes).where(eq(qrCodes.showId, tenant.show.id)).orderBy(qrCodes.createdAt)
  return { gallery: { slug: tenant.gallery.slug, nameEn: tenant.gallery.nameEn, nameFa: tenant.gallery.nameFa }, codes, permissions: (['edit-catalogue', 'manage-staff', 'create-qr'] as const).filter((action) => can(principal, action, tenant.gallery.id)) }
}
export async function action({ request, params }: { request: Request; params: { slug?: string } }) {
  const db = database()
  const { principal, tenant } = await staffTenant(db, request, params.slug ?? '', 'create-qr')
  requireStaffOrigin(request)
  const form = await request.formData()
  try {
    await createStaffQr(db, principal, tenant, String(form.get('label') ?? ''), process.env.PUBLIC_APP_URL || new URL(request.url).origin)
    return { error: false }
  } catch (error) {
    if (error instanceof AccountInputError) return data({ error: true }, { status: 400, headers: staffHeaders() })
    throw error
  }
}
export default function StaffQr() {
  const { gallery, codes, permissions } = useLoaderData<typeof loader>()
  const result = useActionData<typeof action>()
  const { t } = useStaffT()
  return <GalleryStaffLayout gallery={gallery} permissions={permissions}><h2>{t.createQr}</h2>{result?.error && <p role="alert">{t.requestFailed}</p>}
    <Form method="post"><label>{t.qrLabel}<input name="label" required maxLength={120} /></label><button type="submit">{t.createQr}</button></Form>
    <ul>{codes.map((qr) => <li key={qr.code}>{qr.label} <a href={`/staff/${gallery.slug}/qr/${encodeURIComponent(qr.code)}.svg`} download>{t.downloadSvg}</a></li>)}</ul>
  </GalleryStaffLayout>
}

import { Form, useActionData, useLoaderData } from 'react-router'
import { database } from '../../database/context'
import { rotateSharedCode, updateGallery } from '../../server/ops'
import { GalleryLinks, OneTimeValue, OpsSubmit } from '../components/OpsUi'
import { useOpsT } from '../lib/i18n-ops'
import { actionFailure, field, operatorGallery, privateHeaders, requireOrigin } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  const { gallery } = await operatorGallery(request, params.slug ?? '')
  return { gallery }
}
export async function action({ request, params }: { request: Request; params: { slug?: string } }) {
  const { principal, gallery } = await operatorGallery(request, params.slug ?? '')
  requireOrigin(request)
  const form = await request.formData()
  try {
    if (field(form, 'intent') === 'rotate') return { error: false, saved: false, ...await rotateSharedCode(database(), principal, gallery.id) }
    await updateGallery(database(), principal, gallery.id, {
      nameFa: field(form, 'nameFa'), nameEn: field(form, 'nameEn'), status: field(form, 'status') as 'draft' | 'live' | 'paused',
      notes: field(form, 'notes'), sharedCodeEnabled: form.get('sharedCodeEnabled') === 'on',
    })
    return { error: false, saved: true, code: null }
  } catch (error) { return actionFailure(error) }
}

export default function GalleryProfile() {
  const { gallery } = useLoaderData<typeof loader>()
  const result = useActionData<typeof action>()
  const { t, lang } = useOpsT()
  return <><p className="ops-eyebrow">{t.profile}</p><h1>{lang === 'fa' ? gallery.nameFa : gallery.nameEn}</h1><GalleryLinks slug={gallery.slug} />
    <Form method="post" className="ops-form" key={gallery.id}>
      <label>{t.slug}<input value={gallery.slug} readOnly dir="ltr" /></label>
      <label>{t.nameFa}<input name="nameFa" required maxLength={80} defaultValue={gallery.nameFa} dir="rtl" /></label>
      <label>{t.nameEn}<input name="nameEn" required maxLength={80} defaultValue={gallery.nameEn} dir="ltr" /></label>
      <label>{t.status}<select name="status" defaultValue={gallery.status}>{(['draft', 'live', 'paused'] as const).map((status) => <option key={status} value={status}>{t[status]}</option>)}</select></label>
      <label>{t.notes}<textarea name="notes" maxLength={10000} defaultValue={gallery.notes} rows={5} /></label>
      <label className="ops-check"><input type="checkbox" name="sharedCodeEnabled" defaultChecked={gallery.sharedCodeEnabled} />{t.sharedCode}</label>
      <OpsSubmit>{t.save}</OpsSubmit>
    </Form>
    {result?.error && <p className="error" role="alert">{t.invalidFields}</p>}{result?.saved && <p role="status">{t.saved}</p>}
    <section className="ops-section"><Form method="post"><OpsSubmit name="intent" value="rotate">{t.rotate}</OpsSubmit></Form>
      {result?.code && <OneTimeValue value={result.code} label={t.code} />}
    </section>
  </>
}

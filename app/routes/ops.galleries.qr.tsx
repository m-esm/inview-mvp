import { Form, useActionData, useLoaderData } from 'react-router'
import { database } from '../../database/context'
import { createGalleryQr, galleryQrCodes } from '../../server/ops-data'
import { GalleryLinks, OpsSubmit } from '../components/OpsUi'
import { useOpsT } from '../lib/i18n-ops'
import { actionFailure, field, operatorGallery, privateHeaders, requireOrigin } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  const { principal, gallery } = await operatorGallery(request, params.slug ?? '')
  return { gallery, codes: await galleryQrCodes(database(), principal, gallery.id) }
}
export async function action({ request, params }: { request: Request; params: { slug?: string } }) {
  const { principal, gallery } = await operatorGallery(request, params.slug ?? '')
  requireOrigin(request)
  const form = await request.formData()
  try {
    await createGalleryQr(database(), principal, gallery.id, field(form, 'label'), field(form, 'code'))
    return { error: false, saved: true }
  } catch (error) { return actionFailure(error) }
}

export default function GalleryQr() {
  const { gallery, codes } = useLoaderData<typeof loader>()
  const result = useActionData<typeof action>()
  const { t, lang, format } = useOpsT()
  return <><p className="ops-eyebrow">{lang === 'fa' ? gallery.nameFa : gallery.nameEn}</p><h1>{t.qr}</h1><GalleryLinks slug={gallery.slug} />
    {result?.error && <p role="alert">{t.invalidFields}</p>}{result?.saved && <p role="status">{t.saved}</p>}
    <Form method="post" className="ops-form">
      <label>{t.label}<input name="label" maxLength={120} required /></label>
      <label>{t.qrSlug}<input name="code" dir="ltr" pattern="[a-z0-9-]{3,80}" minLength={3} maxLength={80} required /></label>
      <OpsSubmit>{t.createQr}</OpsSubmit>
    </Form>
    <ul className="ops-activity">{codes.map((qr) => <li key={qr.id}>
      <span><strong>{qr.label}</strong> <bdi>{qr.code}</bdi></span><span>{t.scans}: {format.number(qr.scans)}</span>
      <a href={`/ops/galleries/${gallery.slug}/qr/${encodeURIComponent(qr.code)}/download.svg`} download>{t.downloadSvg}<span className="sr-only"> {qr.label}</span></a>
    </li>)}</ul>{!codes.length && <p>{t.noRows}</p>}
  </>
}

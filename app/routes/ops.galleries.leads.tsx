import { Form, useActionData, useLoaderData } from 'react-router'
import { database } from '../../database/context'
import { can } from '../../server/authz'
import { galleryLeads, revealLeadPhone } from '../../server/ops-data'
import { GalleryLinks, OneTimeValue, OpsSubmit } from '../components/OpsUi'
import { useOpsT } from '../lib/i18n-ops'
import { actionFailure, field, operatorGallery, privateHeaders, requireOrigin } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request, params }: { request: Request; params: { slug?: string } }) {
  const { principal, gallery } = await operatorGallery(request, params.slug ?? '')
  return { gallery, leads: await galleryLeads(database(), principal, gallery.id), exportAllowed: can(principal, 'export-leads', gallery.id) }
}
export async function action({ request, params }: { request: Request; params: { slug?: string } }) {
  const { principal, gallery } = await operatorGallery(request, params.slug ?? '')
  requireOrigin(request)
  const form = await request.formData()
  try {
    return { error: false, ...await revealLeadPhone(database(), principal, gallery.id, field(form, 'leadId'), field(form, 'reason')) }
  } catch (error) { return actionFailure(error) }
}

export default function GalleryLeads() {
  const { gallery, leads, exportAllowed } = useLoaderData<typeof loader>()
  const result = useActionData<typeof action>()
  const { t, lang, format } = useOpsT()
  return <><p className="ops-eyebrow">{lang === 'fa' ? gallery.nameFa : gallery.nameEn}</p><h1>{t.leads}</h1><GalleryLinks slug={gallery.slug} />
    <p>{t.leadsLimit}</p>
    {exportAllowed && <a className="btn btn-outline" href={`/ops/galleries/${gallery.slug}/leads.csv`} download>{t.exportCsv}</a>}
    {result?.error && <p role="alert">{t.invalidFields}</p>}
    {result && 'phone' in result && <OneTimeValue key={result.leadId} value={result.phone} label={t.phone} />}
    <div className="ops-team">{leads.map((lead) => <section key={lead.id} className="ops-member">
      <h2>{(lang === 'fa' ? lead.workTitleFa || lead.workTitle : lead.workTitle) || t.noWork}</h2>
      <p><bdi>{lead.phone}</bdi> · {t[lead.kind === 'ask' ? 'askKind' : 'saveKind']}</p>
      <p>{t.time}: {format.dateTime(String(lead.createdAt))} · {t.consent}: <bdi>{lead.consentTextVersion}</bdi></p>
      <Form method="post" className="ops-form"><input type="hidden" name="leadId" value={lead.id} />
        <label>{t.reason}<input name="reason" required maxLength={500} autoComplete="off" /></label>
        <OpsSubmit>{t.reveal}</OpsSubmit>
      </Form>
    </section>)}</div>{!leads.length && <p>{t.noRows}</p>}
  </>
}

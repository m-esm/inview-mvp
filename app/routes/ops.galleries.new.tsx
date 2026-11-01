import { Form, Link, useActionData } from 'react-router'
import { database } from '../../database/context'
import { createGallery } from '../../server/ops'
import { OneTimeValue, OpsSubmit } from '../components/OpsUi'
import { useOpsT } from '../lib/i18n-ops'
import { actionFailure, field, operatorFor, privateHeaders, requireOrigin } from './ops-session.server'

export const headers = privateHeaders
export async function loader({ request }: { request: Request }) {
  await operatorFor(request)
  return null
}
export async function action({ request }: { request: Request }) {
  const principal = await operatorFor(request)
  requireOrigin(request)
  const form = await request.formData()
  try {
    const result = await createGallery(database(), principal, { slug: field(form, 'slug'), nameFa: field(form, 'nameFa'), nameEn: field(form, 'nameEn'), showTitle: field(form, 'showTitle'), ownerIdentifier: field(form, 'ownerIdentifier') })
    return { error: false, invitePath: result.invitePath, slug: result.gallery.slug }
  } catch (error) { return actionFailure(error) }
}

export default function NewGallery() {
  const { t } = useOpsT()
  const result = useActionData<typeof action>()
  return <><h1>{t.newGallery}</h1>
    {result?.invitePath ? <><OneTimeValue value={result.invitePath} label={t.inviteLink} /><Link to={`/ops/galleries/${result.slug}`}>{t.profile}</Link></> :
      <Form method="post" className="ops-form">
        <label>{t.slug}<input name="slug" required pattern="[a-z0-9-]{3,40}" minLength={3} maxLength={40} dir="ltr" /></label>
        <label>{t.nameFa}<input name="nameFa" required maxLength={80} dir="rtl" /></label>
        <label>{t.nameEn}<input name="nameEn" required maxLength={80} dir="ltr" /></label>
        <label>{t.showTitle}<input name="showTitle" required maxLength={160} /></label>
        <label>{t.ownerIdentifier}<input name="ownerIdentifier" required maxLength={320} dir="ltr" autoComplete="off" /></label>
        {result?.error && <p className="error" role="alert">{t.invalidFields}</p>}
        <OpsSubmit>{t.newGallery}</OpsSubmit>
      </Form>}
  </>
}

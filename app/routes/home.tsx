import { redirect } from 'react-router'
import { gallery } from '~/data/gallery'
import { O_SLUG } from '~/lib/galleries'
import Website from '~/pages/site/Website'

export function loader({ request }: { request: Request }) {
  const host = new URL(request.url).hostname
  const isGallerySite = host.endsWith('.inview.ir') && host.split('.')[0] === gallery.subdomain
  if (!isGallerySite) {
    return redirect(`/g/${O_SLUG}`)
  }
  return { isGallerySite: true as const }
}

export default function Home() {
  return <Website />
}

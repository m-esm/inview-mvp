import { Navigate } from 'react-router'
import { gallery } from '~/data/gallery'
import Website from '~/pages/site/Website'

export function loader({ request }: { request: Request }) {
  const host = new URL(request.url).hostname
  const isGallerySite = host.endsWith('.inview.ir') && host.split('.')[0] === gallery.subdomain
  return { isGallerySite }
}

export default function Home({ loaderData }: { loaderData: { isGallerySite: boolean } }) {
  if (loaderData.isGallerySite) return <Website />
  return <Navigate to={`/g/${gallery.slug}`} replace />
}

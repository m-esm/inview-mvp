import { useLoaderData, type MetaFunction } from 'react-router'
import { gallery } from '../data/gallery'
import { galleryPageMeta, pageMeta, rootData } from '../lib/meta'
import InviewLanding, { landingCopy } from '../pages/site/InviewLanding'
import Website from '../pages/site/Website'

export function loader({ request }: { request: Request }) {
  const host = new URL(request.url).hostname
  const isGallerySite = host.endsWith('.inview.ir') && host.split('.')[0] === gallery.subdomain
  return { isGallerySite }
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  if (data?.isGallerySite) return galleryPageMeta('website', matches, '/', undefined)
  const { lang, origin } = rootData(matches)
  const words = landingCopy[lang]
  return pageMeta({ lang, origin, path: '/', title: words.title, description: words.description, image: '/landing/share.png' })
}

export default function Home() {
  const { isGallerySite } = useLoaderData<typeof loader>()
  return isGallerySite ? <Website /> : <InviewLanding />
}

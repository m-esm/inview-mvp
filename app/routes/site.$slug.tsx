import Website from '~/pages/site/Website'
import { loadOGalleryPilot } from './pilot.server'

export async function loader({ params }: { params: { slug?: string } }) {
  const headers = new Headers({
    'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
  })
  if (params.slug !== 'o-gallery') {
    return Response.json({ pilot: null }, { headers })
  }
  const pilot = await loadOGalleryPilot()
  return Response.json({ pilot }, { headers })
}

export default function SitePage() {
  return <Website />
}

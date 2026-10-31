import Work from '~/pages/visitor/Work'

export function headers() {
  return {
    'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
  }
}

export default function GalleryWork() {
  return <Work />
}

import Works from '~/pages/visitor/Works'

export function headers() {
  return {
    'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
  }
}

export default function GalleryWorks() {
  return <Works />
}

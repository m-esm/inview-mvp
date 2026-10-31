import Prices from '~/pages/visitor/Prices'

export function headers() {
  return {
    'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
  }
}

export default function GalleryPrices() {
  return <Prices />
}

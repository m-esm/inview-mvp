import GalleryLayout from '~/pages/gallery/GalleryLayout'

export function headers() {
  return { 'Cache-Control': 'no-store' }
}

export default function DashboardLayout() {
  return <GalleryLayout />
}

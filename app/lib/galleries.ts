import { gallery } from '../data/gallery'

/** The pilot gallery. Its pages come from the database. */
export const O_SLUG = 'o-gallery'

/** The sales demo. Its pages come from `app/data/gallery.ts`. */
export const DEMO_SLUG = gallery.slug

export function isDatabaseGallery(slug: string | undefined): boolean {
  return Boolean(slug) && slug !== DEMO_SLUG
}

export function galleryBase(slug: string): string {
  return `/g/${slug}`
}

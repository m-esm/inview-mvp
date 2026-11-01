import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../database/schema'
import { ensureOGalleryTenant } from '../server/gallery-bootstrap'

/**
 * Writes an O Gallery catalogue straight into the database.
 *
 * The pages now render on the server, so a test that needs a filled or an empty
 * catalogue has to put that state in the database. The publish API refuses the
 * demo image paths these fixtures use, so this helper writes the rows itself.
 */
export interface SeedWork {
  id: string
  title: string
  titleFa?: string
  artist?: string
  artistFa?: string
  medium?: string
  mediumFa?: string
  size?: string
  year?: string
  price?: number | null
  status?: 'available' | 'reserved' | 'sold'
  image?: string
  sample?: boolean
}

export interface SeedRecord {
  name?: string
  nameFa?: string
  showTitle?: string
  showTitleFa?: string
  dates?: string
  datesFa?: string
  hours?: string
  hoursFa?: string
  address?: string
  addressFa?: string
  text?: string
  textFa?: string
  pdfUrl?: string | null
  startsOn?: string | null
  endsOn?: string | null
  works?: SeedWork[]
}

export const EMPTY_CATALOGUE: SeedRecord = { works: [] }

export async function seedCatalogue(record: SeedRecord): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required to seed the O Gallery catalogue.')
  const sql = postgres(url, { max: 1 })
  try {
    const db = drizzle(sql, { schema })
    const { gallery, show } = await ensureOGalleryTenant(db)
    const now = new Date()

    await db
      .update(schema.galleries)
      .set({
        nameEn: record.name ?? 'O Gallery',
        nameFa: record.nameFa ?? 'گالری اُ',
        logoMediaId: null,
        updatedAt: now,
      })
      .where(eq(schema.galleries.id, gallery.id))

    await db
      .update(schema.shows)
      .set({
        titleEn: record.showTitle ?? '',
        titleFa: record.showTitleFa ?? '',
        datesEn: record.dates ?? '',
        datesFa: record.datesFa ?? '',
        hoursEn: record.hours ?? '',
        hoursFa: record.hoursFa ?? '',
        addressEn: record.address ?? '',
        addressFa: record.addressFa ?? '',
        textEn: record.text ?? '',
        textFa: record.textFa ?? '',
        pdfUrl: record.pdfUrl ?? null,
        startsOn: record.startsOn ?? null,
        endsOn: record.endsOn ?? null,
        updatedAt: now,
      })
      .where(eq(schema.shows.id, show.id))

    await db.delete(schema.works).where(eq(schema.works.galleryId, gallery.id))

    let sortOrder = 0
    for (const work of record.works ?? []) {
      await db.insert(schema.works).values({
        id: work.id,
        galleryId: gallery.id,
        artist: work.artist ?? '',
        artistFa: work.artistFa ?? '',
        title: work.title,
        titleFa: work.titleFa ?? '',
        medium: work.medium ?? '',
        mediumFa: work.mediumFa ?? '',
        size: work.size ?? '',
        year: work.year ?? '',
        priceToman: work.price ?? null,
        status: work.status ?? 'available',
        sample: work.sample ?? false,
        imageUrl: work.image ?? '',
        updatedAt: now,
      })
      await db.insert(schema.showWorks).values({
        showId: show.id,
        workId: work.id,
        sortOrder: sortOrder++,
      })
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

import { and, desc, eq, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../database/context'
import { galleries, qrCodes, shows } from '../database/schema'
import { hashSecret } from './crypto'
import { tenantById } from './gallery-record'

type Db = AppDatabase
const O_SLUG = 'o-gallery'

const DEV_ACCESS_CODE = 'inview'

export function resolveOGalleryAccessCode(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.O_GALLERY_ACCESS_CODE
  if (typeof configured === 'string' && configured.trim() !== '') return configured
  if (env.NODE_ENV === 'production') {
    throw new Error('O_GALLERY_ACCESS_CODE is required in production.')
  }
  return DEV_ACCESS_CODE
}

function errorWithoutSecrets(error: unknown, secrets: string[]): Error {
  let message = error instanceof Error ? error.message : 'Database request failed.'
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join('[redacted]')
  }
  return new Error(`Could not store the O Gallery access code hash. ${message}`)
}

export async function ensureOGalleryTenant(
  db: Db,
  accessCodePlain?: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const [existing] = await db.select().from(galleries).where(eq(galleries.slug, O_SLUG)).limit(1)
  if (existing) {
    let [show] = await db
      .select()
      .from(shows)
      .where(eq(shows.galleryId, existing.id))
      .orderBy(desc(shows.updatedAt))
      .limit(1)
    if (!show) {
      const [created] = await db
        .insert(shows)
        .values({ galleryId: existing.id, titleEn: '', titleFa: '', status: 'published' })
        .returning()
      show = created
      await db.insert(qrCodes).values({ showId: show.id, code: 'o-gallery-main', label: 'Entrance' })
    }
    return { gallery: existing, show }
  }

  const code = accessCodePlain?.trim() ? accessCodePlain : resolveOGalleryAccessCode(env)
  const accessCodeHash = hashSecret(code)
  let gallery: typeof galleries.$inferSelect
  try {
    const [created] = await db
      .insert(galleries)
      .values({
        slug: O_SLUG,
        nameEn: 'O Gallery',
        nameFa: 'گالری اُ',
        subdomain: 'ogallery',
        accessCodeHash,
      })
      .returning()
    gallery = created
  } catch (error) {
    throw errorWithoutSecrets(error, [code, accessCodeHash])
  }
  const [show] = await db
    .insert(shows)
    .values({ galleryId: gallery.id, titleEn: '', titleFa: '', status: 'published' })
    .returning()
  await db.insert(qrCodes).values({ showId: show.id, code: 'o-gallery-main', label: 'Entrance' })
  return { gallery, show }
}

export async function syncOGalleryAccessCode(db: Db, env: NodeJS.ProcessEnv = process.env) {
  const { gallery, show } = await ensureOGalleryTenant(db, undefined, env)
  if (gallery.accessCodeHash !== null) return { gallery, show }
  const code = resolveOGalleryAccessCode(env)
  const accessCodeHash = hashSecret(code)
  try {
    const [updated] = await db
      .update(galleries)
      .set({ accessCodeHash, updatedAt: new Date() })
      .where(and(eq(galleries.id, gallery.id), isNull(galleries.accessCodeHash)))
      .returning()
    return updated ? { gallery: updated, show } : (await tenantById(db, gallery.id))!
  } catch (error) {
    throw errorWithoutSecrets(error, [code, accessCodeHash])
  }
}

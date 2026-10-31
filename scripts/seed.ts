import { createDatabase, closeDatabase } from '../database/client'
import { ensureOGalleryTenant } from '../server/gallery-record'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

const db = createDatabase(url)
await ensureOGalleryTenant(db, process.env.O_GALLERY_ACCESS_CODE || 'inview')
console.info('Seeded O Gallery tenant.')
await closeDatabase()

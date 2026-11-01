import { createDatabase, closeDatabase } from '../database/client'
import { syncOGalleryAccessCode } from '../server/gallery-record'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

const db = createDatabase(url)
await syncOGalleryAccessCode(db)
console.info('Seeded O Gallery tenant.')
await closeDatabase()

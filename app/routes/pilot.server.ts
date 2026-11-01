import { database } from '../../database/context'
import { loadPublicRecord } from '../../server/gallery-record'

export async function loadOGalleryPilot() {
  try {
    return await loadPublicRecord(database())
  } catch (error) {
    console.error('O Gallery loader failed', error)
    return null
  }
}

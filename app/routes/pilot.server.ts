import { database } from '../../database/context'
import { loadGalleryState } from '../../server/gallery-record'

export async function loadOGalleryPilot() {
  try {
    return await loadGalleryState(database())
  } catch (error) {
    console.error('O Gallery loader failed', error)
    return null
  }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { mediaObjectKey, publicObjectUrl } from './storage.ts'

const imageId = '11111111-1111-4111-8111-111111111111'

test('public media URL uses the garage bucket path and the u key prefix', () => {
  const key = mediaObjectKey('o-gallery', imageId, 'u')
  assert.equal(key, `u/galleries/o-gallery/${imageId}`)
  assert.equal(
    publicObjectUrl('https://inview-media.moshes.io/inview', `${key}/w640.webp`),
    `https://inview-media.moshes.io/inview/u/galleries/o-gallery/${imageId}/w640.webp`,
  )
})

test('an empty object prefix stores the key under galleries/', () => {
  assert.equal(mediaObjectKey('o-gallery', imageId, ''), `galleries/o-gallery/${imageId}`)
})

test('a missing object prefix defaults to u', () => {
  const saved = process.env.S3_OBJECT_PREFIX
  delete process.env.S3_OBJECT_PREFIX
  try {
    assert.equal(mediaObjectKey('o-gallery', imageId), `u/galleries/o-gallery/${imageId}`)
  } finally {
    if (saved === undefined) delete process.env.S3_OBJECT_PREFIX
    else process.env.S3_OBJECT_PREFIX = saved
  }
})

test('publicObjectUrl drops extra slashes', () => {
  assert.equal(
    publicObjectUrl('https://inview-media.moshes.io/inview/', '/u/galleries/x/w640.webp'),
    'https://inview-media.moshes.io/inview/u/galleries/x/w640.webp',
  )
})

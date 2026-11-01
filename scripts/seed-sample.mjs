import { createHash, randomBytes, scryptSync } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import postgres from 'postgres'
import sharp from 'sharp'

export const SAMPLE_SLUG = 'sample'
export const CONSENT_TEXT_VERSION = '2026-11-01'
export const VARIANT_WIDTHS = [320, 640, 1280]
const SCRYPT_KEYLEN = 64
const REPORT_DAYS = 30
const TEHRAN = 'Asia/Tehran'

export function hashAccessCode(value) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(value, salt, SCRYPT_KEYLEN).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function generateAccessCode() {
  return randomBytes(12).toString('base64url')
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

export function tomanFromText(value) {
  if (value === null || value === undefined || value === '') return null
  let text = String(value)
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .trim()
    .replace(/[,٬\s]/g, '')
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '')
  if (!/^\d+$/.test(text)) throw new Error(`The seed price ${value} is not a toman amount.`)
  return Number(text)
}

export function mediaObjectKey(gallerySlug, imageId, objectPrefix) {
  const raw = objectPrefix === undefined ? 'u' : objectPrefix
  const prefix = raw.replace(/^\/+|\/+$/g, '')
  const rest = `galleries/${gallerySlug}/${imageId}`
  return prefix ? `${prefix}/${rest}` : rest
}

export function storageFromEnv(env = process.env) {
  const bucket = env.S3_BUCKET
  const accessKeyId = env.S3_ACCESS_KEY_ID
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY
  const objectPrefix = env.S3_OBJECT_PREFIX
  if (bucket && accessKeyId && secretAccessKey) {
    const publicHost = env.S3_PUBLIC_HOST || 'inview-media.moshes.io'
    const publicBase = (env.S3_PUBLIC_BASE || `https://${publicHost}/${bucket}`).replace(/\/+$/, '')
    const client = new S3Client({
      region: env.S3_REGION || 'us-east-1',
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      credentials: { accessKeyId, secretAccessKey },
    })
    const publicUrl = (key) => `${publicBase}/${key.replace(/^\/+/, '')}`
    return {
      kind: 's3',
      objectPrefix,
      publicUrl,
      async putObject(key, body, contentType) {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        )
        return publicUrl(key)
      },
    }
  }
  const root = env.MEDIA_DIR || path.join(process.cwd(), '.data', 'media')
  const publicUrl = (key) => `/media/${key.split(path.sep).join('/')}`
  return {
    kind: 'local',
    objectPrefix,
    publicUrl,
    async putObject(key, body) {
      const full = path.join(root, key)
      mkdirSync(path.dirname(full), { recursive: true })
      writeFileSync(full, body)
      return publicUrl(key)
    },
  }
}

export function displayVariant(variants, fallback = null) {
  if (variants['w640.webp']) return variants['w640.webp']
  const webp = Object.keys(variants)
    .filter((key) => key.endsWith('.webp'))
    .sort((a, b) => Number(b.slice(1).split('.')[0]) - Number(a.slice(1).split('.')[0]))
  if (webp.length) return variants[webp[0]]
  return Object.values(variants)[0] || fallback
}

export async function storeImage(storage, gallerySlug, imageId, input) {
  const meta = await sharp(input).rotate().metadata()
  if (!meta.width || !meta.height) throw new Error('A generated image has no size.')
  const prefix = mediaObjectKey(gallerySlug, imageId, storage.objectPrefix)
  const variants = {}
  for (const width of VARIANT_WIDTHS) {
    const target = Math.min(width, meta.width)
    for (const format of ['webp', 'jpeg']) {
      const buffer = await sharp(input)
        .rotate()
        .resize({ width: target, withoutEnlargement: true })
        .toFormat(format, { quality: 82 })
        .toBuffer()
      const key = `${prefix}/w${target}.${format}`
      variants[`w${target}.${format}`] = await storage.putObject(key, buffer, `image/${format}`)
    }
  }
  const originalKey = `${prefix}/original.jpg`
  const original = await sharp(input).rotate().jpeg({ quality: 88 }).toBuffer()
  const primaryUrl = await storage.putObject(originalKey, original, 'image/jpeg')
  return { key: originalKey, width: meta.width, height: meta.height, variants, primaryUrl }
}

export function stableUuid(name) {
  const hex = createHash('sha256').update(`inview-sample:${name}`).digest('hex')
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function prng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PALETTES = [
  ['#1f3b4d', '#e3b23c', '#e8e1d3', '#a63d40', '#6c8ead'],
  ['#2d1e2f', '#c97b84', '#f2d0a4', '#5e6572', '#a0c1b9'],
  ['#0b3c49', '#ffa630', '#d7e8ba', '#4da1a9', '#2e5077'],
  ['#3a2e39', '#f15152', '#edd2e0', '#1e555c', '#f4d8cd'],
  ['#14213d', '#fca311', '#e5e5e5', '#7d5a50', '#b4a5a5'],
  ['#283618', '#bc6c25', '#fefae0', '#606c38', '#dda15e'],
]

export function artworkSvg(seed, width, height, style) {
  const rand = prng(seed)
  const palette = PALETTES[seed % PALETTES.length]
  const pickColor = () => palette[Math.floor(rand() * palette.length)]
  const shapes = []
  const count = 7 + Math.floor(rand() * 9)
  for (let index = 0; index < count; index += 1) {
    const x = rand() * width
    const y = rand() * height
    const size = (0.08 + rand() * 0.35) * Math.min(width, height)
    const opacity = (0.45 + rand() * 0.5).toFixed(2)
    const fill = pickColor()
    if (style === 'circles') {
      shapes.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(1)}" fill="${fill}" opacity="${opacity}"/>`)
    } else if (style === 'bands') {
      const band = height / count
      shapes.push(
        `<rect x="0" y="${(index * band).toFixed(1)}" width="${width}" height="${(band * (0.6 + rand())).toFixed(1)}" fill="${fill}" opacity="${opacity}" transform="rotate(${(rand() * 8 - 4).toFixed(2)} ${width / 2} ${height / 2})"/>`,
      )
    } else if (style === 'arcs') {
      shapes.push(
        `<path d="M ${x.toFixed(1)} ${y.toFixed(1)} q ${(size * 1.5).toFixed(1)} ${(-size).toFixed(1)} ${(size * 3).toFixed(1)} 0" stroke="${fill}" stroke-width="${(size / 5).toFixed(1)}" fill="none" stroke-linecap="round" opacity="${opacity}"/>`,
      )
    } else {
      const rotation = (rand() * 90).toFixed(1)
      shapes.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size.toFixed(1)}" height="${(size * (0.4 + rand())).toFixed(1)}" fill="${fill}" opacity="${opacity}" transform="rotate(${rotation} ${x.toFixed(1)} ${y.toFixed(1)})"/>`,
      )
    }
  }
  const lines = Array.from({ length: 3 }, () => {
    const y = rand() * height
    return `<line x1="0" y1="${y.toFixed(1)}" x2="${width}" y2="${(y + rand() * 120 - 60).toFixed(1)}" stroke="${pickColor()}" stroke-width="${(2 + rand() * 6).toFixed(1)}" opacity="0.7"/>`
  })
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="100%" height="100%" fill="${palette[2]}"/>${shapes.join('')}${lines.join('')}</svg>`,
  )
}

export async function renderArtwork(seed, width, height, style, format) {
  const image = sharp(artworkSvg(seed, width, height, style))
  if (format === 'png') return image.png().toBuffer()
  if (format === 'webp') return image.webp({ quality: 90 }).toBuffer()
  return image.jpeg({ quality: 90 }).toBuffer()
}

async function renderLogo() {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="240" viewBox="0 0 720 240">' +
      '<rect width="720" height="240" fill="#f4f0e8"/>' +
      '<circle cx="120" cy="120" r="84" fill="none" stroke="#17332e" stroke-width="18"/>' +
      '<rect x="78" y="78" width="84" height="84" fill="#a85a32" transform="rotate(45 120 120)"/>' +
      '<rect x="240" y="92" width="420" height="20" fill="#17332e"/>' +
      '<rect x="240" y="132" width="300" height="16" fill="#a85a32"/>' +
      '</svg>',
  )
  return sharp(svg).png().toBuffer()
}

function pdfDocument(lines) {
  const escape = (text) => text.replace(/[\\()]/g, (char) => `\\${char}`)
  const body = lines.map((line, index) => `BT /F1 ${index === 0 ? 18 : 12} Tf 56 ${780 - index * 24} Td (${escape(line)}) Tj ET`).join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(out))
    out += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out)
}

export const GALLERY = {
  nameEn: 'Nimrooz Gallery (demo)',
  nameFa: 'گالری نیمروز (نمونه)',
}

export const SHOW = {
  titleEn: 'Salt and Saffron',
  titleFa: 'نمک و زعفران',
  datesEn: '20 October to 4 December 2026',
  datesFa: '۲۸ مهر تا ۱۳ آذر ۱۴۰۵',
  hoursEn: 'Saturday to Thursday, 11:00 to 19:00',
  hoursFa: 'شنبه تا پنجشنبه، ساعت ۱۱ تا ۱۹',
  addressEn: 'No. 12, Golbarg Alley, Karimkhan Zand Street, Tehran',
  addressFa: 'تهران، خیابان کریمخان زند، کوچه گلبرگ، پلاک ۱۲',
  textEn:
    'Nimrooz is an invented gallery that shows how Inview works. Five painters look at the salt flats near Qom and the saffron fields of Torbat. The works move between mineral white and saffron red, between dry ground and the first rain. Every name, work and price on these pages is a demo.',
  textFa:
    'نیمروز یک گالری ساختگی است که کار با اینویو را نشان می‌دهد. پنج نقاش به کویر نمک نزدیک قم و مزرعه‌های زعفران تربت نگاه می‌کنند. آثار میان سفید معدنی و سرخ زعفرانی، میان خاک خشک و نخستین باران حرکت می‌کنند. همه نام‌ها، آثار و قیمت‌های این صفحه‌ها نمونه هستند.',
  startsOn: '2026-10-20',
  endsOn: '2026-12-04',
}

export const PAST_SHOWS = [
  {
    titleEn: 'Before the Rain',
    titleFa: 'پیش از باران',
    datesEn: '1 to 30 September 2026',
    datesFa: '۱۰ شهریور تا ۸ مهر ۱۴۰۵',
    startsOn: '2026-09-01',
    endsOn: '2026-09-30',
    status: 'archived',
  },
  {
    titleEn: 'Winter Notebook',
    titleFa: 'دفتر زمستان',
    datesEn: 'January 2027',
    datesFa: 'دی ۱۴۰۵',
    startsOn: '2027-01-05',
    endsOn: '2027-02-01',
    status: 'draft',
  },
]

const ARTISTS = {
  mina: ['Mina Rahbar', 'مینا رهبر'],
  kaveh: ['Kaveh Sadeghi', 'کاوه صادقی'],
  leila: ['Leila Farahani', 'لیلا فراهانی'],
  bahram: ['Bahram Niknam', 'بهرام نیکنام'],
  shirin: ['Shirin Afshar', 'شیرین افشار'],
}

const MEDIA = {
  oil: ['Oil on canvas', 'رنگ روغن روی بوم'],
  acrylic: ['Acrylic on canvas', 'اکریلیک روی بوم'],
  mixed: ['Mixed media on paper', 'تکنیک ترکیبی روی کاغذ'],
  ink: ['Ink and saffron on paper', 'مرکب و زعفران روی کاغذ'],
  gouache: ['Gouache on cardboard', 'گواش روی مقوا'],
}

export const WORKS = [
  { id: 'sample-w01', artist: 'mina', title: ['Salt Line', 'خط نمک'], medium: 'oil', size: '100 x 140 cm', year: '2025', price: '۴۸٬۰۰۰٬۰۰۰', status: 'available', image: [101, 1400, 1000, 'bands', 'jpeg'] },
  { id: 'sample-w02', artist: 'mina', title: ['White Noon', 'نیمروز سفید'], medium: 'oil', size: '80 x 80 cm', year: '2025', price: '36,500,000', status: 'reserved', image: [102, 1200, 1200, 'circles', 'png'] },
  { id: 'sample-w03', artist: 'kaveh', title: ['Saffron Field I', 'مزرعه زعفران ۱'], medium: 'acrylic', size: '120 x 90 cm', year: '۱۴۰۳', price: '52.000.000', status: 'sold', image: [103, 1000, 1400, 'blocks', 'webp'] },
  { id: 'sample-w04', artist: 'kaveh', title: ['Saffron Field II', 'مزرعه زعفران ۲'], medium: 'acrylic', size: '120 x 90 cm', year: '2024', price: null, status: 'available', image: [104, 1000, 1400, 'arcs', 'jpeg'] },
  { id: 'sample-w05', artist: 'leila', title: ['First Rain', 'باران نخست'], medium: 'mixed', size: '50 x 70 cm', year: '2026', price: '۱۸۵۰۰۰۰۰', status: 'available', image: [105, 1400, 980, 'arcs', 'png'] },
  { id: 'sample-w06', artist: 'leila', title: ['Dry Ground', 'خاک خشک'], medium: 'mixed', size: '50 x 70 cm', year: '2026', price: '17,000,000', status: 'sold', image: [106, 1400, 980, 'blocks', 'jpeg'] },
  { id: 'sample-w07', artist: 'bahram', title: ['Qom Horizon', 'افق قم'], medium: 'oil', size: '150 x 60 cm', year: '2023', price: '۶۲٬۵۰۰٬۰۰۰', status: 'reserved', image: [107, 1500, 600, 'bands', 'webp'] },
  { id: 'sample-w08', artist: 'bahram', title: ['Mineral Study', 'مطالعه معدنی'], medium: 'gouache', size: '30 x 40 cm', year: '2024', price: '9,800,000', status: 'available', image: [108, 900, 1200, 'circles', 'jpeg'] },
  { id: 'sample-w09', artist: 'shirin', title: ['Red Thread', 'رشته سرخ'], medium: 'ink', size: '35 x 50 cm', year: '2025', price: null, status: 'reserved', image: [109, 980, 1400, 'arcs', 'webp'] },
  { id: 'sample-w10', artist: 'shirin', title: ['Harvest Morning', 'صبح برداشت'], medium: 'ink', size: '35 x 50 cm', year: '2025', price: '۱۲٬۰۰۰٬۰۰۰', status: 'available', image: [110, 980, 1400, 'circles', 'png'] },
  { id: 'sample-w11', artist: 'mina', title: ['Crust', 'پوسته'], medium: 'oil', size: '60 x 60 cm', year: '2022', price: '24,000,000', status: 'sold', image: [111, 1200, 1200, 'blocks', 'png'] },
  { id: 'sample-w12', artist: 'kaveh', title: ['Sample study (sample)', 'طرح نمونه (نمونه)'], medium: 'gouache', size: '21 x 29.7 cm', year: '2026', price: '2,500,000', status: 'available', sample: true, image: [112, 1100, 1400, 'bands', 'jpeg'] },
]

export const REMOVED_WORK = {
  id: 'sample-w13',
  artist: 'bahram',
  title: ['Withdrawn Dune', 'تپه کنار گذاشته'],
  medium: 'oil',
  size: '90 x 120 cm',
  year: '2021',
  price: '30,000,000',
  status: 'available',
  image: [113, 1200, 900, 'bands', 'webp'],
  removedDaysAgo: 9,
}

export const QR_CODES = [
  { code: 'sample-entrance', label: 'Entrance door / در ورودی' },
  { code: 'sample-window', label: 'Street window / ویترین خیابان' },
  { code: 'sample-catalogue', label: 'Printed catalogue / کاتالوگ چاپی' },
]

const PHONE_SUFFIXES = ['0000101', '0000102', '0000103', '0000104', '0000105', '0000106', '0000107', '0000108', '0000109', '0000110', '0000111', '0000112', '0000113', '0000114', '0000115', '0000116', '0000117', '0000118']

export const LEADS = [
  { phone: 0, kind: 'save', work: 'sample-w01', daysAgo: 1 },
  { phone: 1, kind: 'ask', work: 'sample-w01', daysAgo: 2 },
  { phone: 2, kind: 'ask', work: 'sample-w02', daysAgo: 3 },
  { phone: 3, kind: 'save', work: 'sample-w04', daysAgo: 4 },
  { phone: 4, kind: 'ask', work: 'sample-w04', daysAgo: 5 },
  { phone: 5, kind: 'save', work: 'sample-w05', daysAgo: 6 },
  { phone: 6, kind: 'save', work: 'sample-w07', daysAgo: 8 },
  { phone: 7, kind: 'ask', work: 'sample-w07', daysAgo: 10 },
  { phone: 8, kind: 'ask', work: 'sample-w09', daysAgo: 11 },
  { phone: 9, kind: 'save', work: 'sample-w10', daysAgo: 13 },
  { phone: 10, kind: 'save', work: 'sample-w03', daysAgo: 15 },
  { phone: 11, kind: 'ask', work: 'sample-w08', daysAgo: 17 },
  { phone: 12, kind: 'save', work: 'sample-w12', daysAgo: 18 },
  { phone: 13, kind: 'save', work: 'sample-w13', daysAgo: 12 },
  { phone: 14, kind: 'ask', work: 'sample-w13', daysAgo: 14 },
  { phone: 15, kind: 'ask', work: null, daysAgo: 20 },
  { phone: 0, kind: 'ask', work: 'sample-w05', daysAgo: 22 },
  { phone: 16, kind: 'save', work: 'sample-w11', daysAgo: 25 },
  { phone: 17, kind: 'ask', work: 'sample-w06', daysAgo: 27 },
]

const tehranFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TEHRAN, year: 'numeric', month: '2-digit', day: '2-digit' })

export function tehranDay(at) {
  return tehranFormat.format(at)
}

function tehranHourAt(dayStart, hour, minute) {
  return new Date(dayStart.getTime() + (hour * 60 + minute) * 60 * 1000)
}

function tehranMidnight(day) {
  return new Date(`${day}T00:00:00+03:30`)
}

export function buildVisits(now, workIds, removedWork, qrCount) {
  const rand = prng(20261101)
  const rows = []
  const today = tehranDay(now)
  for (let back = REPORT_DAYS - 1; back >= 0; back -= 1) {
    const midnight = tehranMidnight(today)
    const dayStart = new Date(midnight.getTime() - back * 24 * 60 * 60 * 1000)
    const day = tehranDay(new Date(dayStart.getTime() + 12 * 60 * 60 * 1000))
    const weekend = new Date(dayStart.getTime() + 12 * 60 * 60 * 1000).getUTCDay() === 5
    const scans = weekend ? 2 + Math.floor(rand() * 3) : 5 + Math.floor(rand() * 10)
    for (let index = 0; index < scans; index += 1) {
      const visitorId = `sample-visitor-${String((back * 37 + index * 11) % 240).padStart(3, '0')}-${index}`
      const hour = 11 + Math.floor(rand() * 8)
      const at = tehranHourAt(dayStart, hour, Math.floor(rand() * 60))
      if (at.getTime() > now.getTime()) continue
      const roll = rand()
      const qr = roll < 0.15 ? null : Math.min(qrCount - 1, Math.floor((roll - 0.15) / (0.85 / qrCount)))
      rows.push({ kind: 'scan', visitorId, day, at, qr, work: null })
      const views = 1 + Math.floor(rand() * 4)
      for (let view = 0; view < views; view += 1) {
        const viewAt = new Date(at.getTime() + (view + 1) * 90 * 1000)
        if (viewAt.getTime() > now.getTime()) continue
        const choice = rand()
        let work
        if (choice < 0.06) work = null
        else if (choice < 0.12 && back > removedWork.removedDaysAgo) work = removedWork.id
        else work = workIds[Math.floor(rand() * workIds.length)]
        rows.push({ kind: 'view', visitorId, day: tehranDay(viewAt), at: viewAt, qr: null, work })
      }
    }
  }
  return rows
}

function workRow(work, galleryId, mediaRow) {
  const [artist, artistFa] = ARTISTS[work.artist]
  const [medium, mediumFa] = MEDIA[work.medium]
  return {
    id: work.id,
    gallery_id: galleryId,
    artist,
    artist_fa: artistFa,
    title: work.title[0],
    title_fa: work.title[1],
    medium,
    medium_fa: mediumFa,
    size: work.size,
    year: work.year,
    price_toman: tomanFromText(work.price),
    status: work.status,
    sample: Boolean(work.sample),
    media_id: mediaRow.id,
    image_url: displayVariant(mediaRow.variants, mediaRow.primaryUrl),
  }
}

async function prepareMedia(storage) {
  const all = [...WORKS, REMOVED_WORK]
  const prepared = new Map()
  for (const work of all) {
    const [seed, width, height, style, format] = work.image
    const id = stableUuid(`media:${work.id}`)
    const stored = await storeImage(storage, SAMPLE_SLUG, id, await renderArtwork(seed, width, height, style, format))
    prepared.set(work.id, { id, ...stored })
  }
  const logoId = stableUuid('media:logo')
  const logo = { id: logoId, ...(await storeImage(storage, SAMPLE_SLUG, logoId, await renderLogo())) }
  const pdfKey = `${mediaObjectKey(SAMPLE_SLUG, stableUuid('pdf:price-list'), storage.objectPrefix)}/price-list.pdf`
  const pdfUrl = await storage.putObject(
    pdfKey,
    pdfDocument([
      'Nimrooz Gallery (demo): Salt and Saffron',
      'Price list in toman. Every name and price is invented.',
      ...WORKS.map((work) => `${ARTISTS[work.artist][0]}, ${work.title[0]}: ${work.status === 'sold' ? 'sold' : work.price === null ? 'price on request' : tomanFromText(work.price).toLocaleString('en-US')}`),
    ]),
    'application/pdf',
  )
  return { works: prepared, logo, pdfUrl }
}

function absolutePdfUrl(url, env) {
  if (/^https?:\/\//.test(url)) return url
  const origin = (env.PUBLIC_APP_URL || 'https://inview.moshes.io').replace(/\/+$/, '')
  return `${origin}${url}`
}

export async function seedSample({ sql, storage, env = process.env, now = new Date(), log = console.log }) {
  const media = await prepareMedia(storage)
  const allWorks = [...WORKS, REMOVED_WORK]
  const workIds = allWorks.map((work) => work.id)
  const qrCodes = QR_CODES.map((qr) => qr.code)
  const configuredCode = typeof env.SAMPLE_GALLERY_ACCESS_CODE === 'string' ? env.SAMPLE_GALLERY_ACCESS_CODE.trim() : ''
  let printedCode = null

  const counts = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(742002)`
    const foreignWorks = await tx`
      SELECT w.id FROM works w JOIN galleries g ON g.id = w.gallery_id
      WHERE w.id = ANY(${workIds}) AND g.slug <> ${SAMPLE_SLUG}`
    if (foreignWorks.length) throw new Error(`Another gallery owns the work ids ${foreignWorks.map((row) => row.id).join(', ')}.`)
    const foreignQr = await tx`
      SELECT q.code FROM qr_codes q JOIN shows s ON s.id = q.show_id JOIN galleries g ON g.id = s.gallery_id
      WHERE q.code = ANY(${qrCodes}) AND g.slug <> ${SAMPLE_SLUG}`
    if (foreignQr.length) throw new Error(`Another gallery owns the QR codes ${foreignQr.map((row) => row.code).join(', ')}.`)

    const [existing] = await tx`SELECT id, access_code_hash FROM galleries WHERE slug = ${SAMPLE_SLUG}`
    let accessCodeHash = existing?.access_code_hash ?? null
    if (configuredCode) {
      accessCodeHash = hashAccessCode(configuredCode)
    } else if (!accessCodeHash) {
      printedCode = generateAccessCode()
      accessCodeHash = hashAccessCode(printedCode)
    }

    let galleryId
    if (existing) {
      galleryId = existing.id
      await tx`
        UPDATE galleries SET name_en = ${GALLERY.nameEn}, name_fa = ${GALLERY.nameFa}, subdomain = NULL,
          logo_media_id = NULL, access_code_hash = ${accessCodeHash}, updated_at = ${now}
        WHERE id = ${galleryId}`
    } else {
      const [created] = await tx`
        INSERT INTO galleries (slug, name_en, name_fa, subdomain, access_code_hash, created_at, updated_at)
        VALUES (${SAMPLE_SLUG}, ${GALLERY.nameEn}, ${GALLERY.nameFa}, NULL, ${accessCodeHash}, ${now}, ${now})
        RETURNING id`
      galleryId = created.id
    }

    await tx`DELETE FROM leads WHERE gallery_id = ${galleryId}`
    await tx`DELETE FROM visits WHERE show_id IN (SELECT id FROM shows WHERE gallery_id = ${galleryId})`
    await tx`DELETE FROM show_works WHERE show_id IN (SELECT id FROM shows WHERE gallery_id = ${galleryId})`
    await tx`DELETE FROM qr_codes WHERE show_id IN (SELECT id FROM shows WHERE gallery_id = ${galleryId})`
    await tx`DELETE FROM shows WHERE gallery_id = ${galleryId}`
    await tx`DELETE FROM works WHERE gallery_id = ${galleryId}`
    await tx`DELETE FROM media WHERE gallery_id = ${galleryId}`

    const mediaRows = [media.logo, ...media.works.values()].map((row) => ({
      id: row.id,
      gallery_id: galleryId,
      s3_key: row.key,
      width: row.width,
      height: row.height,
      variants: row.variants,
    }))
    for (const row of mediaRows) {
      await tx`
        INSERT INTO media (id, gallery_id, s3_key, width, height, variants)
        VALUES (${row.id}, ${row.gallery_id}, ${row.s3_key}, ${row.width}, ${row.height}, ${tx.json(row.variants)})`
    }
    await tx`UPDATE galleries SET logo_media_id = ${media.logo.id} WHERE id = ${galleryId}`

    const day = 24 * 60 * 60 * 1000
    for (const [index, past] of PAST_SHOWS.entries()) {
      const stamp = new Date(now.getTime() - (40 + index) * day)
      await tx`
        INSERT INTO shows (gallery_id, title_en, title_fa, dates_en, dates_fa, hours_en, hours_fa, address_en, address_fa,
          text_en, text_fa, starts_on, ends_on, status, created_at, updated_at)
        VALUES (${galleryId}, ${past.titleEn}, ${past.titleFa}, ${past.datesEn}, ${past.datesFa}, ${SHOW.hoursEn}, ${SHOW.hoursFa},
          ${SHOW.addressEn}, ${SHOW.addressFa}, '', '', ${past.startsOn}, ${past.endsOn}, ${past.status}, ${stamp}, ${stamp})`
    }
    const [show] = await tx`
      INSERT INTO shows (gallery_id, title_en, title_fa, dates_en, dates_fa, hours_en, hours_fa, address_en, address_fa,
        text_en, text_fa, pdf_url, starts_on, ends_on, status, created_at, updated_at)
      VALUES (${galleryId}, ${SHOW.titleEn}, ${SHOW.titleFa}, ${SHOW.datesEn}, ${SHOW.datesFa}, ${SHOW.hoursEn}, ${SHOW.hoursFa},
        ${SHOW.addressEn}, ${SHOW.addressFa}, ${SHOW.textEn}, ${SHOW.textFa}, ${absolutePdfUrl(media.pdfUrl, env)},
        ${SHOW.startsOn}, ${SHOW.endsOn}, 'published', ${now}, ${now})
      RETURNING id`

    for (const work of allWorks) {
      const row = workRow(work, galleryId, media.works.get(work.id))
      const removedAt = work === REMOVED_WORK ? new Date(now.getTime() - REMOVED_WORK.removedDaysAgo * day) : null
      await tx`
        INSERT INTO works (id, gallery_id, artist, artist_fa, title, title_fa, medium, medium_fa, size, year, price_toman,
          status, sample, media_id, image_url, removed_at, created_at, updated_at)
        VALUES (${row.id}, ${row.gallery_id}, ${row.artist}, ${row.artist_fa}, ${row.title}, ${row.title_fa}, ${row.medium},
          ${row.medium_fa}, ${row.size}, ${row.year}, ${row.price_toman}, ${row.status}, ${row.sample}, ${row.media_id},
          ${row.image_url}, ${removedAt}, ${now}, ${now})`
    }
    for (const [order, work] of WORKS.entries()) {
      await tx`INSERT INTO show_works (show_id, work_id, sort_order) VALUES (${show.id}, ${work.id}, ${order})`
    }

    const qrIds = []
    for (const qr of QR_CODES) {
      const [row] = await tx`INSERT INTO qr_codes (show_id, code, label) VALUES (${show.id}, ${qr.code}, ${qr.label}) RETURNING id`
      qrIds.push(row.id)
    }

    const visitRows = buildVisits(now, WORKS.map((work) => work.id), REMOVED_WORK, qrIds.length)
    for (let start = 0; start < visitRows.length; start += 200) {
      const chunk = visitRows.slice(start, start + 200).map((visit) => ({
        show_id: show.id,
        qr_code_id: visit.qr === null ? null : qrIds[visit.qr],
        visitor_id: visit.visitorId,
        kind: visit.kind,
        day: visit.day,
        work_id: visit.work,
        created_at: visit.at,
      }))
      await tx`INSERT INTO visits ${tx(chunk, 'show_id', 'qr_code_id', 'visitor_id', 'kind', 'day', 'work_id', 'created_at')}`
    }

    for (const lead of LEADS) {
      const at = new Date(now.getTime() - lead.daysAgo * day - 3 * 60 * 60 * 1000)
      await tx`
        INSERT INTO leads (gallery_id, show_id, work_id, phone, kind, consent_at, consent_text_version, created_at)
        VALUES (${galleryId}, ${show.id}, ${lead.work}, ${`0912${PHONE_SUFFIXES[lead.phone]}`}, ${lead.kind}, ${at},
          ${CONSENT_TEXT_VERSION}, ${at})`
    }

    return countRows(tx, galleryId)
  })

  if (printedCode) log(`SAMPLE_ACCESS_CODE=${printedCode}`)
  return counts
}

export async function countRows(sql, galleryId) {
  const [row] = await sql`
    SELECT
      (SELECT count(*) FROM galleries WHERE id = ${galleryId})::int AS galleries,
      (SELECT count(*) FROM media WHERE gallery_id = ${galleryId})::int AS media,
      (SELECT count(*) FROM shows WHERE gallery_id = ${galleryId})::int AS shows,
      (SELECT count(*) FROM works WHERE gallery_id = ${galleryId})::int AS works,
      (SELECT count(*) FROM works WHERE gallery_id = ${galleryId} AND removed_at IS NOT NULL)::int AS removed_works,
      (SELECT count(*) FROM show_works sw JOIN shows s ON s.id = sw.show_id WHERE s.gallery_id = ${galleryId})::int AS show_works,
      (SELECT count(*) FROM qr_codes q JOIN shows s ON s.id = q.show_id WHERE s.gallery_id = ${galleryId})::int AS qr_codes,
      (SELECT count(*) FROM visits v JOIN shows s ON s.id = v.show_id WHERE s.gallery_id = ${galleryId} AND v.kind = 'scan')::int AS scans,
      (SELECT count(*) FROM visits v JOIN shows s ON s.id = v.show_id WHERE s.gallery_id = ${galleryId} AND v.kind = 'view')::int AS views,
      (SELECT count(*) FROM leads WHERE gallery_id = ${galleryId})::int AS leads`
  return row
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required.')
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const storage = storageFromEnv(process.env)
    const counts = await seedSample({ sql, storage })
    console.error(`Seeded the ${SAMPLE_SLUG} gallery with ${storage.kind} media: ${JSON.stringify(counts)}`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}

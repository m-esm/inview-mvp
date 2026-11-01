import { artworks, gallery as demoGallery, show as demoShow } from '../data/gallery'
import type { Lang } from './lang'
import { pick, type PilotRecord, type PilotWork } from './pilot'

type MetaTag = Record<string, string>

type MetaMatch = { id: string; data?: unknown } | undefined

const copy = {
  en: {
    site: 'Inview',
    tagline: 'The show, the works and the prices, in your pocket.',
    works: 'Works',
    prices: 'Price list',
    about: 'Visit and contact',
    website: 'Website',
    profile: 'My Inview',
    notFound: 'Page not found',
    showDescription: (name: string) => `Works, prices and visit details for the current show at ${name}.`,
    worksDescription: (name: string) => `See every work in the current show at ${name}, with status and price.`,
    pricesDescription: (name: string) => `The price list for the current show at ${name}.`,
    aboutDescription: (name: string) => `Address, hours and artists at ${name}.`,
    workDescription: (name: string) => `A work in the current show at ${name}.`,
  },
  fa: {
    site: 'اینویو',
    tagline: 'نمایشگاه، آثار و قیمت‌ها در جیب شما.',
    works: 'آثار',
    prices: 'فهرست قیمت',
    about: 'بازدید و تماس',
    website: 'وب‌سایت',
    profile: 'حساب من',
    notFound: 'صفحه پیدا نشد',
    showDescription: (name: string) => `آثار، قیمت‌ها و اطلاعات بازدید نمایش جاری ${name}.`,
    worksDescription: (name: string) => `همه آثار نمایش جاری ${name} را با وضعیت و قیمت ببینید.`,
    pricesDescription: (name: string) => `فهرست قیمت نمایش جاری ${name}.`,
    aboutDescription: (name: string) => `نشانی، ساعت کاری و هنرمندان ${name}.`,
    workDescription: (name: string) => `اثری از نمایش جاری ${name}.`,
  },
}

export type PageKind = 'show' | 'works' | 'prices' | 'about' | 'work' | 'website'

export function metaCopy(lang: Lang) {
  return copy[lang]
}

export function rootData(matches: MetaMatch[]): { lang: Lang; origin: string } {
  const root = matches.find((match) => match?.id === 'root')?.data as { lang?: Lang; origin?: string } | undefined
  return { lang: root?.lang ?? 'fa', origin: root?.origin ?? '' }
}

function absolute(origin: string, path: string): string {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`
}

export function pageMeta(input: {
  lang: Lang
  origin: string
  path: string
  title: string
  description: string
  image?: string
  noindex?: boolean
}): MetaTag[] {
  const { lang, origin, path, title, description } = input
  const image = input.image ? absolute(origin, input.image) : ''
  const url = absolute(origin, path)
  const tags: MetaTag[] = [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: copy[lang].site },
    { property: 'og:locale', content: lang === 'fa' ? 'fa_IR' : 'en_US' },
    { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ]
  if (url) {
    tags.push({ property: 'og:url', content: url })
    tags.push({ tagName: 'link', rel: 'canonical', href: url })
  }
  if (image) {
    tags.push({ property: 'og:image', content: image })
    tags.push({ name: 'twitter:image', content: image })
  }
  if (input.noindex) tags.push({ name: 'robots', content: 'noindex' })
  return tags
}

function preloadImage(work: PilotWork | null | undefined, sizes: string): MetaTag[] {
  if (!work?.image) return []
  const set = work.imageSet?.webp
  const tag: MetaTag = { tagName: 'link', rel: 'preload', as: 'image', href: work.image, fetchPriority: 'high' }
  if (set) {
    tag.imageSrcSet = set
    tag.imageSizes = sizes
    tag.type = 'image/webp'
  }
  return [tag]
}

function coverWork(record: PilotRecord | null): PilotWork | undefined {
  return record?.works.find((work) => !work.sample && work.image) ?? record?.works.find((work) => work.image)
}

function galleryName(record: PilotRecord | null, lang: Lang): string {
  if (record) return pick(lang, record.name, record.nameFa)
  return lang === 'fa' ? demoGallery.nameFa : demoGallery.name
}

function showName(record: PilotRecord | null, lang: Lang): string {
  if (record) return pick(lang, record.showTitle, record.showTitleFa)
  return lang === 'fa' ? demoShow.titleFa : demoShow.title
}

function coverImage(record: PilotRecord | null): string {
  if (record) return record.works.find((work) => work.image && !work.sample)?.image ?? ''
  return artworks[1]?.image ?? ''
}

export function galleryPageMeta(
  kind: PageKind,
  matches: MetaMatch[],
  path: string,
  data: { pilot?: PilotRecord | null; work?: PilotWork | null } | undefined,
): MetaTag[] {
  const { lang, origin } = rootData(matches)
  const words = copy[lang]
  const record = data?.pilot ?? null
  const name = galleryName(record, lang)
  const showTitle = showName(record, lang)
  const join = (...parts: string[]) => parts.filter(Boolean).join(' · ')
  if (kind === 'work') {
    const work = data?.work
    const demo = !work ? artworks.find((item) => path.endsWith(`/${item.id}`)) : undefined
    const title = work ? pick(lang, work.title, work.titleFa ?? '') : demo ? (demo.title ?? '') : ''
    const artist = work
      ? pick(lang, work.artist, work.artistFa ?? '')
      : demo
        ? (lang === 'fa' && demo.artistFa ? demo.artistFa : demo.artist)
        : ''
    return [
      ...pageMeta({
        lang,
        origin,
        path,
        title: join([title, artist].filter(Boolean).join(lang === 'fa' ? '، ' : ', '), name),
        description: words.workDescription(name),
        image: work?.image || demo?.image,
        noindex: Boolean(record?.demo),
      }),
      ...preloadImage(work, '(min-width: 960px) 60vw, 100vw'),
    ]
  }
  const map: Record<Exclude<PageKind, 'work'>, { title: string; description: string }> = {
    show: { title: join(showTitle, name), description: words.showDescription(name) },
    works: { title: join(words.works, showTitle || name), description: words.worksDescription(name) },
    prices: { title: join(words.prices, name), description: words.pricesDescription(name) },
    about: { title: join(words.about, name), description: words.aboutDescription(name) },
    website: { title: join(name, words.website), description: words.showDescription(name) },
  }
  const tags = pageMeta({ lang, origin, path, ...map[kind], image: coverImage(record), noindex: Boolean(record?.demo) })
  if (kind === 'show') tags.push(...preloadImage(coverWork(record), '(min-width: 960px) 55vw, 100vw'))
  return tags
}

import type { Lang } from './lang'

const NUMBER_LOCALE: Record<Lang, string> = { fa: 'fa-IR', en: 'en-US' }
const DATE_LOCALE: Record<Lang, string> = { fa: 'fa-IR-u-ca-persian', en: 'en-US' }
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000
// ICU builds differ on thin and no-break spaces in dates (Node puts U+2009 around the range dash, Chromium
// does not), so the server and client text would not match at hydration.
const ICU_SPACES = /[\u00A0\u2009\u202F]/g

const numberFormats = new Map<Lang, Intl.NumberFormat>()
const dateFormats = new Map<Lang, Intl.DateTimeFormat>()

function numberFormat(lang: Lang): Intl.NumberFormat {
  let format = numberFormats.get(lang)
  if (!format) {
    format = new Intl.NumberFormat(NUMBER_LOCALE[lang], { maximumFractionDigits: 0 })
    numberFormats.set(lang, format)
  }
  return format
}

function dateFormat(lang: Lang): Intl.DateTimeFormat {
  let format = dateFormats.get(lang)
  if (!format) {
    format = new Intl.DateTimeFormat(DATE_LOCALE[lang], {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    })
    dateFormats.set(lang, format)
  }
  return format
}

export function formatNumber(lang: Lang, value: number): string {
  return numberFormat(lang).format(value)
}

export function formatToman(lang: Lang, value: number, unit: string): string {
  return `${formatNumber(lang, value)} ${unit}`
}

export function localDigits(lang: Lang, text: string): string {
  if (lang !== 'fa') return text
  return text.replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)])
}

export function asciiDigits(text: string): string {
  return text
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
}

export function formatSize(lang: Lang, text: string): string {
  return localDigits(lang, text.replace(/(?<=[0-9۰-۹٠-٩])\s*[xX×]\s*(?=[0-9۰-۹٠-٩])/g, ' × '))
}

function parseDay(value: string | null | undefined): Date | null {
  if (!value || !DATE_ONLY.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(lang: Lang, value: string | null | undefined): string {
  const date = parseDay(value)
  return date ? plainSpaces(dateFormat(lang).format(date)) : ''
}

function plainSpaces(text: string): string {
  return text.replace(ICU_SPACES, ' ')
}

export function formatDateRange(
  lang: Lang,
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const from = parseDay(start)
  const to = parseDay(end)
  if (from && to && to.getTime() >= from.getTime()) return plainSpaces(dateFormat(lang).formatRange(from, to))
  return formatDate(lang, start) || formatDate(lang, end)
}

export interface DayParts {
  year: number
  month: number
  day: number
}

const DAY_SEED: Record<Lang, (parts: DayParts) => number> = {
  fa: ({ year, month, day }) =>
    Date.UTC(year + 621, 2, 19) + (jalaliDayOfYear(month, day) - 1) * DAY_MS,
  en: ({ year, month, day }) => Date.UTC(year, month - 1, day),
}
const DAY_SHIFTS: Record<Lang, number[]> = { fa: [0, 1, 2, 3, -1, -2], en: [0] }
const REFERENCE_YEAR: Record<Lang, number> = { fa: 1403, en: 2024 }

const partFormats = new Map<Lang, Intl.DateTimeFormat>()
const monthNameLists = new Map<Lang, string[]>()

function jalaliDayOfYear(month: number, day: number): number {
  return (month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30) + day
}

function partFormat(lang: Lang): Intl.DateTimeFormat {
  let format = partFormats.get(lang)
  if (!format) {
    const calendar = lang === 'fa' ? 'en-u-ca-persian' : 'en-u-ca-gregory'
    format = new Intl.DateTimeFormat(calendar, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    })
    partFormats.set(lang, format)
  }
  return format
}

export function dayToParts(lang: Lang, value: string | null | undefined): DayParts | null {
  const date = parseDay(value)
  if (!date) return null
  const found: Record<string, number> = {}
  for (const part of partFormat(lang).formatToParts(date)) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      found[part.type] = Number(part.value.replace(/\D/g, ''))
    }
  }
  const { year, month, day } = found
  if (!year || !month || !day) return null
  return { year, month, day }
}

export function partsToDay(lang: Lang, parts: DayParts): string | null {
  const { year, month, day } = parts
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (!Number.isInteger(day) || day < 1 || day > 31) return null
  const seed = DAY_SEED[lang](parts)
  if (Number.isNaN(seed)) return null
  for (const shift of DAY_SHIFTS[lang]) {
    const iso = new Date(seed + shift * DAY_MS).toISOString().slice(0, 10)
    const found = dayToParts(lang, iso)
    if (found && found.year === year && found.month === month && found.day === day) return iso
  }
  return null
}

export function monthNames(lang: Lang): string[] {
  let names = monthNameLists.get(lang)
  if (!names) {
    const format = new Intl.DateTimeFormat(DATE_LOCALE[lang], { month: 'long', timeZone: 'UTC' })
    names = Array.from({ length: 12 }, (_, index) => {
      const iso = partsToDay(lang, { year: REFERENCE_YEAR[lang], month: index + 1, day: 1 })
      return iso ? format.format(new Date(`${iso}T00:00:00Z`)) : ''
    })
    monthNameLists.set(lang, names)
  }
  return names
}

export function monthLength(lang: Lang, year: number, month: number): number {
  for (let day = 31; day > 28; day--) {
    if (partsToDay(lang, { year, month, day })) return day
  }
  return 28
}

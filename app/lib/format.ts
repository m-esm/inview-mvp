import type { Lang } from './lang'

const NUMBER_LOCALE: Record<Lang, string> = { fa: 'fa-IR', en: 'en-US' }
const DATE_LOCALE: Record<Lang, string> = { fa: 'fa-IR-u-ca-persian', en: 'en-US' }
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

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

function parseDay(value: string | null | undefined): Date | null {
  if (!value || !DATE_ONLY.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(lang: Lang, value: string | null | undefined): string {
  const date = parseDay(value)
  return date ? dateFormat(lang).format(date) : ''
}

export function formatDateRange(
  lang: Lang,
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const from = parseDay(start)
  const to = parseDay(end)
  if (from && to && to.getTime() >= from.getTime()) return dateFormat(lang).formatRange(from, to)
  if (from) return dateFormat(lang).format(from)
  if (to) return dateFormat(lang).format(to)
  return ''
}

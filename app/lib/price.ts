import { asciiDigits } from './format'

// Grouping marks: comma, Arabic thousands separator, and spaces.
// "1.000.000" is a grouped integer. A single dot is not a toman price.
export function parseToman(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return 'invalid'
    return Math.round(value)
  }
  if (typeof value !== 'string') return 'invalid'
  let text = asciiDigits(value).trim()
  if (!text) return null
  text = text.replace(/[,٬\s]/g, '')
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '')
  if (!/^\d+$/.test(text)) return 'invalid'
  const price = Number(text)
  if (!Number.isFinite(price) || price < 0) return 'invalid'
  return price
}

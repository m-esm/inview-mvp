export const GALLERY_TIME_ZONE = 'Asia/Tehran'

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: GALLERY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function tehranDay(now: Date = new Date()): string {
  return dayFormat.format(now)
}

function stampFormat(locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: GALLERY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const gregorianStamp = stampFormat('en-CA')
const jalaliStamp = stampFormat('en-CA-u-ca-persian')

function stamp(format: Intl.DateTimeFormat, at: Date): string {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
  for (const part of format.formatToParts(at)) parts[part.type] = part.value
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

export function tehranGregorianStamp(at: Date): string {
  return stamp(gregorianStamp, at)
}

export function tehranJalaliStamp(at: Date): string {
  return stamp(jalaliStamp, at)
}

export const QR_CODE_PATTERN = /^[a-z0-9-]{3,80}$/

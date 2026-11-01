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

export const QR_CODE_PATTERN = /^[a-z0-9-]{3,80}$/

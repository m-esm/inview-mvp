// The server accepts only this version. Change it when the sentences change.
export const CONSENT_TEXT_VERSION = '2026-11-01'

export const consentText = {
  en: {
    privacy:
      'Save sends your mobile number and the saved work to this gallery. Ask sends your mobile number and the work you ask about to this gallery.',
    consent: 'I agree. This gallery may store my mobile number with this work.',
    needConsent: 'Agree to store your mobile number before you continue.',
  },
  fa: {
    privacy:
      'اگر اثری را ذخیره کنید، این گالری شماره موبایل شما و آن اثر را دریافت می‌کند. اگر درباره اثری بپرسید، این گالری شماره موبایل شما و آن اثر را دریافت می‌کند.',
    consent: 'موافقم که این گالری شماره موبایل من را همراه این اثر ذخیره کند.',
    needConsent: 'برای ادامه، ذخیره شماره موبایل را بپذیرید.',
  },
}

export function leadBody(input: {
  phone: string
  kind: 'save' | 'ask'
  workId: string
  visitorId: string
}) {
  return {
    op: 'lead' as const,
    kind: input.kind,
    phone: input.phone,
    visitorId: input.visitorId,
    workId: input.workId,
    consent: true as const,
    consentTextVersion: CONSENT_TEXT_VERSION,
  }
}

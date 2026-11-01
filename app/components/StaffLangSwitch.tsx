import { useCallback, useEffect } from 'react'
import { useRevalidator } from 'react-router'
import { useStaffT } from '../lib/i18n-staff'
import { langCookie, type Lang } from '../lib/lang'

export function StaffLangSwitch() {
  const { t, lang, dir } = useStaffT()
  const revalidator = useRevalidator()

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const choose = useCallback(
    (next: Lang) => {
      if (next === lang) return
      document.cookie = langCookie(next)
      void revalidator.revalidate()
    },
    [lang, revalidator],
  )

  return (
    <div className="lang" role="group" aria-label={t.language}>
      <button type="button" aria-pressed={lang === 'en'} onClick={() => choose('en')} lang="en">EN</button>
      <button type="button" aria-pressed={lang === 'fa'} onClick={() => choose('fa')} className="fa-btn" lang="fa">فا</button>
    </div>
  )
}

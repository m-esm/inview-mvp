import { useCallback } from 'react'
import { useRevalidator } from 'react-router'
import { useT } from '../lib/i18n'
import { langCookie, type Lang } from '../lib/lang'

export function LangSwitch() {
  const { t, lang } = useT()
  const revalidator = useRevalidator()

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

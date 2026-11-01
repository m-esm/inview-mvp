// ADR D7. The language cookie changes the HTML, so a shared cache must vary on it.
export const PUBLIC_PAGE_HEADERS = {
  'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
  Vary: 'Cookie',
}

export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
}

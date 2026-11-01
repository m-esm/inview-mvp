# ADR 0001: Architecture for the Inview platform

- Status: Proposed
- Date: 2026-11-01
- Scope: the O Gallery pilot and the multi-tenant base
- Deciders: Mohsen (build and operations), Ali (product, Iran market)

## 1. Context

Inview gives art galleries in Iran a visitor app, a price list and a gallery website.
A visitor scans a QR code at a show. The visitor sees the works and the prices on a mobile phone.

The current code is a Vite and React single-page app (SPA). The O Gallery pilot adds a
JSON file store (`server/pilot-store.mjs`). This store keeps images as base64 text.
It has one shared editor password in the code. It works for a demo. It does not work
for many galleries.

These facts and needs control the decisions:

1. Most users are in Iran on mobile networks. The international link is slow and can
   stop. Filters can block a foreign service. We must be able to move to an Iranian
   host (ArvanCloud or Liara) later.
2. Public pages read much more than they write. They show many images.
3. Gallery websites (`/site/:slug`, later `<slug>.inview.ir`) need search engine
   results (SEO) and a fast first paint. The visitor app must stay an installable PWA.
   It must show pages that the visitor opened before when the network is weak.
4. Many galleries, shows, works and QR codes from the first day.
5. Persian text, right-to-left (RTL) layout, prices in Toman, Jalali dates.
6. Login with a phone number and a one-time code (OTP). Iranian SMS provider.
   Staff roles in each gallery.
7. Payments in Iran have a sanctions risk for Mohsen.
8. Galleries need counts of scans, views and leads.
9. The team is small. Mohsen operates the ha3 cluster (k3s, Flux, SOPS, Traefik,
   cert-manager, CNPG Postgres, Garage S3, Cloudflare tunnel).

Facts that we checked on 2026-10-31:

- Monitors in Iran (covered.ir) show Cloudflare sites as reachable from 10 Iranian
  networks. Median time to first byte is 240 ms to 1.4 s.
- Vercel shows "403 DDoS Migration" errors to users in Iran, because Iranian traffic
  comes from shared gateway addresses (Vercel community forum, May 2026).
  Vercel terms also limit use from sanctioned countries.
- ArvanCloud CDN is reachable in Iran. During the 2026 shutdown, foreign points could
  not connect to Iranian servers. The reverse is also true.

## 2. Decisions

Each decision compares two or more options. The chosen option is first.

### D1. Hosting and portability

| Option | For | Against |
|---|---|---|
| **One OCI container image on ha3, behind Cloudflare now. The same image on an Iranian host later.** | No lock-in. Iranian hosts (Liara, ArvanCloud) run containers and have Postgres and S3-compatible storage. Mohsen operates ha3 today at no new cost. | ha3 is in the EU. Each request crosses the international link. |
| Vercel | Easy deploys. Already in `vercel.json`. | 403 errors for Iranian users. Sanctions terms. Functions and `/tmp` storage are not permanent. Lock-in. |
| Iranian host now | Fastest for users. No filter risk. | Needs an Iranian account and payment (Ali). Mohsen cannot operate it now. |

Decision: build one container image. Configure it only with environment variables.
Use only Postgres and the S3 API as backing services. Do not use a CDN-specific
feature (no Workers, no Vercel functions, no Cloudflare Images).
Keep `vercel.json` for the old demo only.

### D2. Rendering: SSR or SPA

| Option | For | Against |
|---|---|---|
| **React Router 7 in framework mode (SSR on Node, Vite build)** | We already use React Router and React. The upgrade from v6 is an official path. It gives SSR, loaders and actions in one app. It uses Vite, so `vite-plugin-pwa` still works. It runs in a plain Node container. | The routes change to the framework route config. The PWA needs a new offline plan (no `index.html` fallback). |
| Keep the Vite SPA, add prerender for `/site/*` | Smallest change. | Prerender at build time does not show edits until a new build. Each gallery edit needs a deploy. Bad first paint on slow networks. |
| Next.js | Big ecosystem, SSR, ISR. | Many features expect Vercel (image optimizer, ISR cache). Heavier. A rewrite of the client. |
| Astro with React islands | Very fast static pages. | Two models: Astro for sites and a React app for the visitor app and editor. More to learn and to keep. |
| TanStack Start | Type-safe server functions, Vite. | Newer. Fewer production users. More risk for a small team. |

Decision: React Router 7 framework mode. Render on the server the gallery website,
the show welcome page, the works list, one work, and the price list. Keep the editor
and the visitor profile as client pages inside the same app.

### D3. API style

| Option | For | Against |
|---|---|---|
| **React Router loaders and actions, plus a few JSON resource routes** | One framework. Types flow from the loader to the page. No second server. Resource routes give plain HTTP for QR beacons and uploads. | Not a public API. A future mobile app needs a REST surface. |
| tRPC 11 (wishlist pattern) | Good types. Mohsen knows it. | A second layer next to SSR loaders. tRPC calls do not help SSR or SEO. |
| Hono REST | Small, fast, portable, clear HTTP. | We write the client types ourselves. A second server next to the SSR app. |

Decision: loaders and actions for pages. Resource routes under `/api/v1/` for the scan
and view beacon, lead capture, uploads and health. If a mobile app or a partner needs
an API later, add Hono under `/api/v1/` in the same server.

### D4. Runtime

| Option | For | Against |
|---|---|---|
| **Node 22 LTS** | Every host supports it, also Liara and ArvanCloud. `sharp` and the AWS SDK work without problems. Long support. | A little slower than Bun. |
| Bun (wishlist pattern) | Fast install and start. Built-in test runner. | Fewer hosts support it. Some native modules have problems. |

Decision: Node 22 LTS. Tests use `node --test` and Vitest only where it is necessary.

### D5. Database and data model

| Option | For | Against |
|---|---|---|
| **Postgres with Drizzle ORM and SQL migrations** | Relational data, transactions, JSON when it is necessary. CNPG on ha3 now. Managed Postgres on Iranian hosts later. Drizzle is light and gives typed queries. | One more service to operate. |
| SQLite (file on a volume) | Simple. | One writer, one pod. A volume ties the app to one node. Harder to move. |
| JSON file (current pilot) | No setup. | No concurrency, no queries, images in text. |

Decision: Postgres. Use a new database `inview` on the CNPG cluster `postgres/pg`.
Use one shared schema. Each tenant row carries `gallery_id`. Every query filters by
`gallery_id`. Add Postgres row level security later, if more people write code.

Tables:

- `galleries` (slug, names in English and Persian, subdomain, logo)
- `users` (phone), `memberships` (user, gallery, role: owner, editor, viewer)
- `sessions`, `otp_challenges`
- `shows` (gallery, titles, dates, hours, address, text, status)
- `works` (gallery, artist, title, medium, size, year, price_toman, status, sample)
- `show_works` (show, work, order)
- `qr_codes` (show, code, label). One show can have many QR codes.
- `media` (gallery, S3 key, width, height, variants)
- `visits` (show, qr_code, visitor id, kind: scan or view, day)
- `leads` (gallery, show, work, phone, kind, consent time, consent text version)

Prices are whole Toman in `bigint`. Times are UTC `timestamptz`.

### D6. Images

| Option | For | Against |
|---|---|---|
| **Make fixed variants at upload with `sharp` (for example 320, 640, 1280 px, WebP and JPEG). Store them in S3. Serve them with long cache headers.** | No extra service. Works the same on any host and any CDN. Static files cache well. | Fixed sizes. A new size needs a backfill job. |
| imgproxy in front of S3 | Any size on request. AVIF and WebP. | One more service. Signed URLs. A CDN cache is necessary to keep the CPU low. |
| Base64 in the database or JSON (current pilot) | Simple. | Large pages, no cache, slow on mobile. |

Decision: variants at upload. The server checks the type and the size, removes EXIF
data and writes the variants to S3. Storage is Garage (bucket `inview`, public host
`inview-media.moshes.io`) now. ArvanCloud Object Storage or Liara storage later.
Add imgproxy only if we need many sizes.

### D7. Caching

- Hashed build files and media: `Cache-Control: public, max-age=31536000, immutable`.
- Public SSR pages: `public, max-age=0, s-maxage=60, stale-while-revalidate=600`.
- Editor and API: `no-store`.
- The CDN (Cloudflare now, ArvanCloud later) follows these headers. We do not use a
  CDN-specific rule.

### D8. PWA and offline

- Keep the manifest and `vite-plugin-pwa` (Workbox).
- Navigations: network first, with a timeout of 3 s. Then the cached page. Then an
  offline page.
- Media: stale while revalidate, with a size limit.
- The PWA must stay installable on iOS Safari and Android Chrome.

### D9. Persian, RTL, Toman, Jalali

| Option | For | Against |
|---|---|---|
| **`Intl` APIs (`fa-IR`, calendar `persian`) and the current `i18n.ts`** | No extra library. Correct Persian digits and Jalali dates. | `Intl` support on very old phones is not complete. |
| `date-fns-jalali` or `dayjs` with a Jalali plugin | Date arithmetic in Jalali. | Extra bundle size. |

Decision: use `Intl.DateTimeFormat('fa-IR-u-ca-persian')` and
`Intl.NumberFormat('fa-IR')`. Set `dir="rtl"` and `lang="fa"` on the server for Persian.
Store dates in UTC. Add a Jalali library only for date input in the editor.

### D10. Login, sessions and roles

| Option | For | Against |
|---|---|---|
| **Phone OTP behind an `SmsProvider` interface. Server sessions in Postgres with an httpOnly cookie. Roles in `memberships`.** | We can stop a session at once. Simple. The provider can change (Kavenegar, Ghasedak, SMS.ir). | One database read for each request. |
| JWT in the browser | No session table. | Hard to stop a stolen token. |
| A shared editor password (old pilot) | Simple. | No users, no roles, no audit. |

Decision: OTP codes have 6 digits. The server stores only a hash. A code is valid for
2 minutes. The server limits attempts for each phone and each IP address. In
development, a console provider writes the code to the log. In production, the app
uses Kavenegar when Ali gives an API key and a sender line. Until then, the pilot uses
one access code for each gallery. The code is the environment variable
`O_GALLERY_ACCESS_CODE` in a SOPS secret. The database keeps only a scrypt hash.
At start, the server writes a new hash when the saved hash is empty or does not match
the code. The log does not show the code or the hash. In production, the server stops
when the variable is missing. A development default is allowed only when `NODE_ENV`
is not `production`. Until OTP is available, publish, upload and staff sign-in use
the Postgres limits in D13.

The O Gallery editor uses a staff session until phone OTP is ready. Staff open
`/dashboard/sign-in` and send the gallery access code once. The server checks the
scrypt hash. It does not store the code. The server writes a row in `sessions`.
The row stores the SHA-256 hash of a random token and the gallery id. `user_id`
stays empty. The cookie name is `inview_staff`. The cookie is httpOnly, Secure,
and SameSite=Lax. It expires after 12 hours. `/dashboard/o-gallery`, publish,
image upload, and `/api/pilot/staff` read this cookie. A missing or expired session
sends the editor to the sign-in page. The staff API returns 401. Sign-out deletes
the session row and clears the cookie. The Rooz demo pages under `/dashboard` stay
public. They do not use this gate. The browser bundle does not contain the access code.

### D11. Payments

Payments are not in the MVP. We do not add a payment provider. Iranian gateways need
an Iranian company and have sanctions risk for Mohsen. Ali decides about payments.
If we add them, they go behind a `PaymentProvider` interface, under an account that
Ali or his company owns.

### D12. Analytics

| Option | For | Against |
|---|---|---|
| **Postgres tables (`visits`, `leads`) and daily totals for each show** | No third-party script. No filter risk. The data stays with the gallery data. Easy to show in the dashboard. | We write the reports. |
| Umami or Plausible (self-hosted) | Ready reports. | One more service. It does not know shows, works and QR codes. |

Decision: Postgres tables. A visitor id is a random value in the browser. We do not
store IP addresses. Rate-limit rows store a daily hash of the client address.
They do not store the address. Leads store a phone number only after the visitor agrees.
The server stores the consent time and the consent text version. A Save lead and
an Ask lead each include the work id. A lead without consent returns 400. The
server stores no phone number in that case.

### D13. Operations

Reuse from ha3 only what is the best fit:

- Flux and the `m-esm/cluster-had` tenant repo: yes. Git is the source of truth.
- SOPS and age: yes, for the database URL, S3 keys and the access codes.
- CNPG Postgres: yes. Backups go to Garage already.
- Garage S3: yes. It uses the S3 API, so a move is easy.
- Traefik, cert-manager, Cloudflare tunnel: yes.
- Redis: no. We do not need it now. Rate limits use Postgres.

Access-code checks, visits, leads and uploads use a fixed window in `rate_limits`.
The server reads the client address from `CF-Connecting-IP`.
It stores a SHA-256 hash of a daily salt and that address.
It does not store the address.
A full window returns HTTP 429, a `Retry-After` header, and a short message in English and Persian.
The README lists each limit and its environment variable.
A visit limit per address is high because many phones can share one network.

CI: GitHub Actions run the tests and the build, then push
`ghcr.io/m-esm/inview-mvp:<short-sha>`. A migration Job runs once for each image tag,
the same as the wishlist app.

## 3. Recommendation

Build one Node 22 container with React Router 7 (SSR, loaders and actions, Vite, PWA),
Drizzle and Postgres, and S3 storage with image variants made at upload.
Run it on ha3 with Flux now. Keep it free of host-specific features, so that we can
move it to an Iranian host.

The pilot scope is:

1. The multi-tenant schema and migrations.
2. O Gallery as the first tenant. The Rooz demo stays as it is (mock data).
3. The editor with a gallery access code (OTP comes when the SMS key comes).
4. Image upload to S3 with variants.
5. Scan, view and lead counts.
6. Deploy to `inview.moshes.io` and `inview-media.moshes.io`.

## 4. Open questions for Ali

1. Domain: who registers `inview.ir`, and when? Wildcard subdomains need a wildcard
   certificate and DNS access.
2. Hosting in Iran: which provider, and when? Who owns the account?
3. SMS: which provider, which sender line, and who pays?
4. Payments: do we need them in the first year? Under which company?
5. Privacy: what text do we show before we store a visitor phone number?
6. Data location: must the gallery data stay in Iran?
7. Who owns the code and the brand? This fork is the deploy source. Ali's repository
   gets the same commits through pull request 1.

## 5. Consequences

- The pilot JSON store and the shared password go away. We migrate the O Gallery
  record into Postgres once.
- `vercel.json` stays for the old static demo only. The production site is on ha3.
- We need a migration Job for each release.
- The build adds `sharp`, `drizzle-orm`, `postgres` and the AWS S3 client.

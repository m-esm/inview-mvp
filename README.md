# Inview

Inview gives art galleries in Iran a visitor app, a price list and a gallery website.
A visitor scans a QR code at a show. The visitor sees the works and the prices on a mobile phone.

This repository holds the O Gallery pilot and the multi-tenant base.
See `docs/adr/0001-architecture.md` for the architecture decisions.

## What you get

| Address | What it shows |
|---|---|
| `/g/o-gallery` | O Gallery visitor welcome (QR target) |
| `/g/o-gallery/works` | Works list |
| `/g/o-gallery/works/<id>` | One work |
| `/g/o-gallery/prices` | Price list |
| `/site/o-gallery` | O Gallery public website |
| `/dashboard/o-gallery` | Editor (gallery access code) |
| `/g/rooz-gallery` | Rooz Gallery demo (mock data, unchanged) |
| `/api/v1/health` | Health check |
| `/api/v1/pilot` | O Gallery JSON resource route |

The visitor side works in English and Persian.

## Stack

- Node 22 LTS
- React Router 7 (SSR, loaders, Vite, PWA)
- Postgres with Drizzle ORM
- S3-compatible image storage (Garage now; local disk in development)
- One OCI container image: `ghcr.io/m-esm/inview-mvp`

## Run it on your machine

1. Install Node 22.
2. Start Postgres (or use Docker Compose):

```bash
docker compose up -d postgres
```

3. Copy the environment file and set the database URL:

```bash
cp .env.example .env
```

4. Install, migrate, seed and start:

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open the address it prints, usually http://localhost:3000.

In development, the gallery access code is `inview` when `O_GALLERY_ACCESS_CODE` is not set. In production, the server stops when `O_GALLERY_ACCESS_CODE` is missing. At start, the server stores a new scrypt hash when the saved hash is empty or does not match. The log does not show the code or the hash.

## Tests

```bash
npm test
```

Tests use an in-process Postgres (PGlite). They do not need Docker.

## Build and run the container

```bash
npm run build
docker build -t ghcr.io/m-esm/inview-mvp:local .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgres://... \
  -e O_GALLERY_ACCESS_CODE=... \
  ghcr.io/m-esm/inview-mvp:local
```

CI runs unit tests, the production build, and Playwright smoke tests on each
pull request. A push to `main` (or a sync from `pilot-o-gallery`) also pushes
`ghcr.io/m-esm/inview-mvp:<short-sha>` and
`ghcr.io/m-esm/inview-mvp:main-<run_number>-<short-sha>` for Flux image
automation. A push to `pilot-o-gallery` fast-forwards `main`, or opens and
merges a sync pull request when a fast-forward is not possible.

## Environment

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Postgres URL (required) |
| `PUBLIC_APP_URL` | Public site origin for QR links |
| `O_GALLERY_ACCESS_CODE` | Access code for O Gallery. Required in production. The server stores only a scrypt hash. |
| `MEDIA_DIR` | Local media folder when S3 is not set |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_HOST` | Garage / S3 |
| `KAVENEGAR_API_KEY`, `KAVENEGAR_SENDER` | SMS OTP (optional; console provider is the default) |
| `S3_PUBLIC_BASE` | Public origin plus the bucket path. Production: `https://inview-media.moshes.io/inview` |
| `S3_OBJECT_PREFIX` | Object key prefix the media route can serve. Production: `u` |

## Deploy notes

- Production target: `inview.moshes.io` with media on `inview-media.moshes.io`.
- A public image URL is `S3_PUBLIC_BASE` plus the object key. Production keys start with `u/galleries/`.
- Configure the app with environment variables only.
- Run `npm run db:migrate` once for each new image tag (migration Job).
- Keep `vercel.json` for the old static demo only.

## Text style

User-facing English text in this project follows ASD-STE100 rules:
short sentences, clear verbs, and one idea per sentence.

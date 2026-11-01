import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const membershipRoleEnum = pgEnum('membership_role', [
  'owner',
  'editor',
  'viewer',
])

export const showStatusEnum = pgEnum('show_status', [
  'draft',
  'published',
  'archived',
])

export const workStatusEnum = pgEnum('work_status', [
  'available',
  'reserved',
  'sold',
])

export const visitKindEnum = pgEnum('visit_kind', ['scan', 'view'])

export const leadKindEnum = pgEnum('lead_kind', ['save', 'ask'])

export const galleries = pgTable(
  'galleries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 80 }).notNull(),
    nameEn: varchar('name_en', { length: 80 }).notNull(),
    nameFa: varchar('name_fa', { length: 80 }).notNull(),
    subdomain: varchar('subdomain', { length: 80 }),
    logoMediaId: uuid('logo_media_id'),
    accessCodeHash: text('access_code_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('galleries_slug_uidx').on(table.slug)],
)

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    phone: varchar('phone', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('users_phone_uidx').on(table.phone)],
)

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    galleryId: uuid('gallery_id')
      .notNull()
      .references(() => galleries.id, { onDelete: 'cascade' }),
    role: membershipRoleEnum('role').notNull().default('editor'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('memberships_user_gallery_uidx').on(table.userId, table.galleryId),
  ],
)

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const otpChallenges = pgTable('otp_challenges', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 20 }).notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const shows = pgTable('shows', {
  id: uuid('id').defaultRandom().primaryKey(),
  galleryId: uuid('gallery_id')
    .notNull()
    .references(() => galleries.id, { onDelete: 'cascade' }),
  titleEn: varchar('title_en', { length: 160 }).notNull().default(''),
  titleFa: varchar('title_fa', { length: 160 }).notNull().default(''),
  datesEn: varchar('dates_en', { length: 80 }).notNull().default(''),
  datesFa: varchar('dates_fa', { length: 80 }).notNull().default(''),
  hoursEn: varchar('hours_en', { length: 120 }).notNull().default(''),
  hoursFa: varchar('hours_fa', { length: 120 }).notNull().default(''),
  addressEn: varchar('address_en', { length: 180 }).notNull().default(''),
  addressFa: varchar('address_fa', { length: 180 }).notNull().default(''),
  textEn: text('text_en').notNull().default(''),
  textFa: text('text_fa').notNull().default(''),
  pdfUrl: varchar('pdf_url', { length: 500 }),
  status: showStatusEnum('status').notNull().default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const media = pgTable('media', {
  id: uuid('id').defaultRandom().primaryKey(),
  galleryId: uuid('gallery_id')
    .notNull()
    .references(() => galleries.id, { onDelete: 'cascade' }),
  s3Key: text('s3_key').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  variants: jsonb('variants')
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const works = pgTable('works', {
  // Client-generated ids stay as text so the pilot editor can keep stable keys.
  id: varchar('id', { length: 80 }).primaryKey(),
  galleryId: uuid('gallery_id')
    .notNull()
    .references(() => galleries.id, { onDelete: 'cascade' }),
  artist: varchar('artist', { length: 80 }).notNull().default(''),
  title: varchar('title', { length: 120 }).notNull(),
  medium: varchar('medium', { length: 80 }).notNull().default(''),
  size: varchar('size', { length: 80 }).notNull().default(''),
  year: varchar('year', { length: 20 }).notNull().default(''),
  priceToman: bigint('price_toman', { mode: 'number' }),
  status: workStatusEnum('status').notNull().default('available'),
  sample: boolean('sample').notNull().default(false),
  mediaId: uuid('media_id').references(() => media.id, { onDelete: 'set null' }),
  // Pilot keeps a direct URL (local media or S3 public URL) for simple SSR pages.
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const showWorks = pgTable(
  'show_works',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    workId: varchar('work_id', { length: 80 })
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    uniqueIndex('show_works_show_work_uidx').on(table.showId, table.workId),
  ],
)

export const qrCodes = pgTable(
  'qr_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 80 }).notNull(),
    label: varchar('label', { length: 120 }).notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('qr_codes_code_uidx').on(table.code)],
)

export const visits = pgTable(
  'visits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    showId: uuid('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    qrCodeId: uuid('qr_code_id').references(() => qrCodes.id, { onDelete: 'set null' }),
    visitorId: varchar('visitor_id', { length: 80 }).notNull(),
    kind: visitKindEnum('kind').notNull(),
    day: date('day').notNull(),
    workId: varchar('work_id', { length: 80 }).references(() => works.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One landing scan per visitor per day. Views are not unique.
    uniqueIndex('visits_scan_dedupe_uidx')
      .on(table.showId, table.visitorId, table.day)
      .where(sql`${table.kind} = 'scan'`),
  ],
)

export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  galleryId: uuid('gallery_id')
    .notNull()
    .references(() => galleries.id, { onDelete: 'cascade' }),
  showId: uuid('show_id').references(() => shows.id, { onDelete: 'set null' }),
  workId: varchar('work_id', { length: 80 }).references(() => works.id, {
    onDelete: 'set null',
  }),
  phone: varchar('phone', { length: 20 }).notNull(),
  kind: leadKindEnum('kind').notNull(),
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  consentTextVersion: varchar('consent_text_version', { length: 40 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const rateLimits = pgTable('rate_limits', {
  bucket: varchar('bucket', { length: 200 }).primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  hits: integer('hits').notNull(),
})

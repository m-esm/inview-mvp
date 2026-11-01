ALTER TABLE "leads" ADD COLUMN "consent_text_version" varchar(40) DEFAULT 'unrecorded' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "consent_text_version" DROP DEFAULT;

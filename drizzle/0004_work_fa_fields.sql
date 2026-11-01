ALTER TABLE "works" ADD COLUMN "title_fa" varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "artist_fa" varchar(80) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "medium_fa" varchar(80) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "shows" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "shows" ADD COLUMN "ends_on" date;

ALTER TABLE "galleries" ADD COLUMN "is_demo" boolean NOT NULL DEFAULT false;
UPDATE "galleries" SET "is_demo" = true WHERE "slug" = 'sample';

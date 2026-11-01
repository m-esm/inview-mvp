CREATE TYPE "public"."platform_role" AS ENUM('admin', 'support');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."invitation_kind" AS ENUM('staff', 'operator', 'reset');--> statement-breakpoint
CREATE TYPE "public"."gallery_status" AS ENUM('draft', 'live', 'paused');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" varchar(320),
  ADD COLUMN "name" text DEFAULT '' NOT NULL,
  ADD COLUMN "password_hash" text,
  ADD COLUMN "platform_role" "platform_role",
  ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL,
  ADD COLUMN "last_signed_in_at" timestamp with time zone,
  ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree (lower("email")) WHERE "email" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "created_by" uuid REFERENCES "users"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "galleries" ADD COLUMN "status" "gallery_status" DEFAULT 'live' NOT NULL,
  ADD COLUMN "notes" text DEFAULT '' NOT NULL,
  ADD COLUMN "shared_code_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE "invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text NOT NULL,
  "kind" "invitation_kind" NOT NULL,
  "gallery_id" uuid REFERENCES "galleries"("id") ON DELETE cascade,
  "role" "membership_role",
  "platform_role" "platform_role",
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_uidx" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "gallery_id" uuid REFERENCES "galleries"("id") ON DELETE set null,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "audit_logs_gallery_created_idx" ON "audit_logs" USING btree ("gallery_id", "created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_user_id", "created_at");

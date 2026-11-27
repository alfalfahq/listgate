CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"content_hash" text,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"error" text,
	"stored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_url_unique" ON "media_assets" USING btree ("source_url");--> statement-breakpoint
CREATE INDEX "media_assets_due_idx" ON "media_assets" USING btree ("status","next_attempt_at");
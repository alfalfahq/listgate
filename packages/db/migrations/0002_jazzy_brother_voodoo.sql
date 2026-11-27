CREATE TABLE "agent_partners" (
	"source_id" uuid NOT NULL,
	"email" text NOT NULL,
	"partner_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_partners_source_id_email_partner_id_pk" PRIMARY KEY("source_id","email","partner_id")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"feed_token" text NOT NULL,
	"contact_email" text,
	"notes" text,
	"last_feed_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "agents_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "agents_locked_reason" text;--> statement-breakpoint
ALTER TABLE "agent_partners" ADD CONSTRAINT "agent_partners_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_partners" ADD CONSTRAINT "agent_partners_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_partners" ADD CONSTRAINT "agent_partners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_partners_partner_idx" ON "agent_partners" USING btree ("partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_slug_unique" ON "sources" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_feed_token_unique" ON "sources" USING btree ("feed_token");--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agencies_source_agent_unique" ON "agencies" USING btree ("source_id","reaxml_agent_id");--> statement-breakpoint
CREATE INDEX "agents_email_idx" ON "agents" USING btree (lower("email"));
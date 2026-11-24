CREATE TYPE "public"."agency_role" AS ENUM('owner', 'editor');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."listing_kind" AS ENUM('sale', 'rent');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('current', 'under_offer', 'sold', 'leased', 'withdrawn', 'off_market');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('login', 'invite', 'impersonate');--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"initials" text NOT NULL,
	"reaxml_agent_id" text,
	"crm" text,
	"suburb" text,
	"state" text,
	"abn" text,
	"contact_email" text,
	"website" text,
	"feed_token" text NOT NULL,
	"authorised_at" timestamp with time zone,
	"authorised_by" text,
	"last_feed_at" timestamp with time zone,
	"notes" text,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_members" (
	"agency_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "agency_role" DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_members_agency_id_user_id_pk" PRIMARY KEY("agency_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "agency_partners" (
	"agency_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"partner_agency_ref" text,
	"changed_by_id" uuid,
	"changed_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_partners_agency_id_partner_id_pk" PRIMARY KEY("agency_id","partner_id")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"ext_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"photo" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"agency_id" uuid,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"partner_id" uuid NOT NULL,
	"agency_id" uuid,
	"listing_id" uuid,
	"event" text NOT NULL,
	"listing_version" integer,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_status" integer,
	"last_error" text,
	"ms" integer,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agency_id" uuid,
	"via" text NOT NULL,
	"file_name" text,
	"bytes" integer DEFAULT 0 NOT NULL,
	"received" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"unchanged" integer DEFAULT 0 NOT NULL,
	"removed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"ext_id" text NOT NULL,
	"category" text NOT NULL,
	"status" "listing_status" DEFAULT 'current' NOT NULL,
	"kind" "listing_kind" DEFAULT 'sale' NOT NULL,
	"property_type" text,
	"unit_number" text,
	"street_number" text,
	"street" text,
	"suburb" text,
	"state" text,
	"postcode" text,
	"display_address" boolean DEFAULT true NOT NULL,
	"price_text" text,
	"price" integer,
	"price_display" boolean DEFAULT false NOT NULL,
	"rent_per_week" integer,
	"sold_price" integer,
	"sold_price_display" boolean DEFAULT false NOT NULL,
	"sold_date" text,
	"auction_at" text,
	"beds" integer,
	"baths" integer,
	"cars" integer,
	"land_area" double precision,
	"land_area_unit" text,
	"building_area" double precision,
	"headline" text,
	"description" text,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"floorplans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"video_url" text,
	"inspections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"agent_ext_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb,
	"mod_time" text,
	"content_hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"email" text,
	"user_id" uuid,
	"agency_id" uuid,
	"agency_role" "agency_role",
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"website" text,
	"webhook_url" text,
	"signing_secret" text NOT NULL,
	"api_key_hash" text,
	"api_key_last4" text,
	"kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"include_sold" boolean DEFAULT true NOT NULL,
	"confidential" boolean DEFAULT false NOT NULL,
	"listed" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"max_attempts" integer DEFAULT 12 NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error" text,
	"sort" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section" text DEFAULT 'General' NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"link" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"user_agent" text,
	"impersonator_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author_name" text NOT NULL,
	"from_staff" boolean DEFAULT false NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" bigserial NOT NULL,
	"agency_id" uuid,
	"raised_by_user_id" uuid,
	"raised_by_name" text NOT NULL,
	"raised_by_email" text NOT NULL,
	"kind" text DEFAULT 'problem' NOT NULL,
	"subject" text NOT NULL,
	"page" text,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assignee_id" uuid,
	"description" text,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"due_on" date,
	"rank" double precision DEFAULT 0 NOT NULL,
	"resolved_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"password_hash" text,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"admin_role" text DEFAULT 'full' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"author_id" uuid,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_page_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"note" text,
	"author_id" uuid,
	"author_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"emoji" text,
	"body" text DEFAULT '' NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort" double precision DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"owner_id" uuid,
	"updated_by_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agency_members" ADD CONSTRAINT "agency_members_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_members" ADD CONSTRAINT "agency_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_partners" ADD CONSTRAINT "agency_partners_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_partners" ADD CONSTRAINT "agency_partners_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_partners" ADD CONSTRAINT "agency_partners_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_runs" ADD CONSTRAINT "feed_runs_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonator_id_users_id_fk" FOREIGN KEY ("impersonator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_raised_by_user_id_users_id_fk" FOREIGN KEY ("raised_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_comments" ADD CONSTRAINT "wiki_comments_page_id_wiki_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_comments" ADD CONSTRAINT "wiki_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_versions" ADD CONSTRAINT "wiki_page_versions_page_id_wiki_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_versions" ADD CONSTRAINT "wiki_page_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agencies_slug_unique" ON "agencies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "agencies_feed_token_unique" ON "agencies" USING btree ("feed_token");--> statement-breakpoint
CREATE INDEX "agency_members_user_idx" ON "agency_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agency_partners_partner_idx" ON "agency_partners" USING btree ("partner_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_agency_ext_unique" ON "agents" USING btree ("agency_id","ext_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_agency_time_idx" ON "audit_log" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "deliveries_due_idx" ON "deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "deliveries_partner_time_idx" ON "deliveries" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE INDEX "deliveries_listing_idx" ON "deliveries" USING btree ("listing_id","partner_id");--> statement-breakpoint
CREATE INDEX "feed_runs_agency_time_idx" ON "feed_runs" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "feed_runs_time_idx" ON "feed_runs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_agency_ext_unique" ON "listings" USING btree ("agency_id","ext_id");--> statement-breakpoint
CREATE INDEX "listings_updated_idx" ON "listings" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "listings_agency_status_idx" ON "listings" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "listings_suburb_idx" ON "listings" USING btree ("state","suburb");--> statement-breakpoint
CREATE UNIQUE INDEX "login_tokens_token_unique" ON "login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "partners_slug_unique" ON "partners" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "partners_api_key_unique" ON "partners" USING btree ("api_key_hash");--> statement-breakpoint
CREATE INDEX "project_tasks_open_idx" ON "project_tasks" USING btree ("done_at","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_idx" ON "ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_number_unique" ON "tickets" USING btree ("number");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE INDEX "tickets_agency_idx" ON "tickets" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "wiki_comments_page_idx" ON "wiki_comments" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_versions_unique" ON "wiki_page_versions" USING btree ("page_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_pages_slug_unique" ON "wiki_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "wiki_pages_parent_idx" ON "wiki_pages" USING btree ("parent_id","sort");
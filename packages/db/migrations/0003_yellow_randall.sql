CREATE TABLE "agency_property_partners" (
	"agency_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"approved_by_id" uuid,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_property_partners_agency_id_partner_id_pk" PRIMARY KEY("agency_id","partner_id")
);
--> statement-breakpoint
CREATE TABLE "agent_property_partners" (
	"source_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"partner_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_property_partners_source_id_ref_partner_id_pk" PRIMARY KEY("source_id","ref","partner_id")
);
--> statement-breakpoint
CREATE TABLE "crm_identities" (
	"source_id" uuid NOT NULL,
	"crm_user_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text,
	"office_ref" text,
	"role" text,
	"is_principal" boolean DEFAULT false NOT NULL,
	"via" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_identities_source_id_crm_user_id_pk" PRIMARY KEY("source_id","crm_user_id")
);
--> statement-breakpoint
CREATE TABLE "listing_exclusions" (
	"listing_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"user_id" uuid,
	"by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_exclusions_listing_id_partner_id_pk" PRIMARY KEY("listing_id","partner_id")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"ext_id" text NOT NULL,
	"agent_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unit_number" text,
	"street_number" text,
	"street" text,
	"suburb" text,
	"state" text,
	"postcode" text,
	"lat" double precision,
	"lng" double precision,
	"property_type" text,
	"beds" integer,
	"baths" integer,
	"cars" integer,
	"land_area" double precision,
	"building_area" double precision,
	"year_built" integer,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_sale_date" text,
	"last_sale_price" integer,
	"content_hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"mode" text DEFAULT 'delta' NOT NULL,
	"file_name" text,
	"bytes" integer DEFAULT 0 NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"offices" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"unchanged" integer DEFAULT 0 NOT NULL,
	"removed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"error" text,
	"ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_shares" (
	"partner_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"visible" boolean NOT NULL,
	"version" integer NOT NULL,
	"changed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_shares_partner_id_property_id_pk" PRIMARY KEY("partner_id","property_id")
);
--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "accepts_properties" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "property_token" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "property_mapping" jsonb;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "property_sample" jsonb;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_property_feed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "sso" jsonb;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "link_secret" text;--> statement-breakpoint
ALTER TABLE "agency_property_partners" ADD CONSTRAINT "agency_property_partners_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_property_partners" ADD CONSTRAINT "agency_property_partners_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_property_partners" ADD CONSTRAINT "agency_property_partners_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_property_partners" ADD CONSTRAINT "agent_property_partners_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_property_partners" ADD CONSTRAINT "agent_property_partners_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_property_partners" ADD CONSTRAINT "agent_property_partners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_identities" ADD CONSTRAINT "crm_identities_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_identities" ADD CONSTRAINT "crm_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_exclusions" ADD CONSTRAINT "listing_exclusions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_exclusions" ADD CONSTRAINT "listing_exclusions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_exclusions" ADD CONSTRAINT "listing_exclusions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_runs" ADD CONSTRAINT "property_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_shares" ADD CONSTRAINT "property_shares_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_shares" ADD CONSTRAINT "property_shares_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_identities_user_idx" ON "crm_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_agency_ext_unique" ON "properties" USING btree ("agency_id","ext_id");--> statement-breakpoint
CREATE INDEX "properties_agency_idx" ON "properties" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "property_runs_source_idx" ON "property_runs" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE INDEX "property_shares_feed_idx" ON "property_shares" USING btree ("partner_id","changed_at","property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_property_token_unique" ON "sources" USING btree ("property_token");
CREATE TYPE "public"."device_provider" AS ENUM('apple_healthkit', 'android_health_connect', 'wearable');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android', 'web');--> statement-breakpoint
CREATE TYPE "public"."device_connection_status" AS ENUM('pending', 'connected', 'syncing', 'error', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."metric_scope" AS ENUM('steps', 'sleep', 'weight', 'workouts', 'recovery_inputs');--> statement-breakpoint
CREATE TYPE "public"."health_metric_type" AS ENUM('steps', 'sleep', 'weight', 'workout', 'recovery_input');--> statement-breakpoint
CREATE TYPE "public"."aggregate_period_type" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TABLE "device_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "device_provider" NOT NULL,
	"granted_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allow_ai_context" boolean DEFAULT true NOT NULL,
	"consent_version" text DEFAULT 'v1' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"provider" "device_provider" NOT NULL,
	"platform" "device_platform" NOT NULL,
	"status" "device_connection_status" DEFAULT 'pending' NOT NULL,
	"granted_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connected_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_sync_cursor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"device_connection_id" uuid,
	"metric_type" "health_metric_type" NOT NULL,
	"provider" "device_provider" NOT NULL,
	"source_id" text,
	"dedupe_key" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"observed_end_at" timestamp with time zone,
	"unit" text NOT NULL,
	"normalized_payload" jsonb NOT NULL,
	"source_device_label" text,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_metric_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_id" uuid NOT NULL,
	"metric_type" "health_metric_type" NOT NULL,
	"period_type" "aggregate_period_type" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"aggregate_payload" jsonb NOT NULL,
	"source_metric_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_consents" ADD CONSTRAINT "device_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_connections" ADD CONSTRAINT "device_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_connections" ADD CONSTRAINT "device_connections_consent_id_device_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."device_consents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_metric_snapshots" ADD CONSTRAINT "health_metric_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_metric_snapshots" ADD CONSTRAINT "health_metric_snapshots_consent_id_device_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."device_consents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_metric_snapshots" ADD CONSTRAINT "health_metric_snapshots_device_connection_id_device_connections_id_fk" FOREIGN KEY ("device_connection_id") REFERENCES "public"."device_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_metric_aggregates" ADD CONSTRAINT "health_metric_aggregates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_metric_aggregates" ADD CONSTRAINT "health_metric_aggregates_consent_id_device_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."device_consents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_consents_user_provider_idx" ON "device_consents" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "device_consents_user_revoked_idx" ON "device_consents" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "device_connections_user_provider_idx" ON "device_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "device_connections_consent_idx" ON "device_connections" USING btree ("consent_id");--> statement-breakpoint
CREATE INDEX "device_connections_user_status_idx" ON "device_connections" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "health_metric_snapshots_user_dedupe_idx" ON "health_metric_snapshots" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "health_metric_snapshots_user_metric_observed_idx" ON "health_metric_snapshots" USING btree ("user_id","metric_type","observed_at");--> statement-breakpoint
CREATE INDEX "health_metric_snapshots_consent_idx" ON "health_metric_snapshots" USING btree ("consent_id");--> statement-breakpoint
CREATE INDEX "health_metric_snapshots_connection_idx" ON "health_metric_snapshots" USING btree ("device_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "health_metric_aggregates_user_period_idx" ON "health_metric_aggregates" USING btree ("user_id","metric_type","period_type","period_start");--> statement-breakpoint
CREATE INDEX "health_metric_aggregates_user_consent_idx" ON "health_metric_aggregates" USING btree ("user_id","consent_id");

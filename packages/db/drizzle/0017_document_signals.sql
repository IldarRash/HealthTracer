CREATE TYPE "public"."document_signal_key" AS ENUM('vitamin_d', 'ferritin', 'hemoglobin', 'fasting_glucose', 'total_cholesterol', 'resting_heart_rate', 'energy_level');--> statement-breakpoint
CREATE TYPE "public"."document_signal_review_status" AS ENUM('pending_review', 'approved', 'rejected', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."document_signal_extraction_status" AS ENUM('not_started', 'processing', 'ready', 'failed', 'revoked');--> statement-breakpoint
ALTER TABLE "health_documents" ADD COLUMN "signal_extraction_status" "document_signal_extraction_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "health_documents" ADD COLUMN "signal_extraction_failure_reason" text;--> statement-breakpoint
ALTER TABLE "health_documents" ADD COLUMN "signal_extracted_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "document_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"health_document_id" uuid NOT NULL,
	"signal_key" "document_signal_key" NOT NULL,
	"display_label" text NOT NULL,
	"value_text" text NOT NULL,
	"unit" text NOT NULL,
	"reference_range_text" text,
	"observed_at" timestamp with time zone,
	"source_section" text NOT NULL,
	"confidence_score" numeric(4, 3) NOT NULL,
	"review_status" "document_signal_review_status" DEFAULT 'pending_review' NOT NULL,
	"ignored_reason" text,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_signals" ADD CONSTRAINT "document_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_signals" ADD CONSTRAINT "document_signals_health_document_id_health_documents_id_fk" FOREIGN KEY ("health_document_id") REFERENCES "public"."health_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_signals_document_idx" ON "document_signals" USING btree ("health_document_id");--> statement-breakpoint
CREATE INDEX "document_signals_user_review_idx" ON "document_signals" USING btree ("user_id","review_status");--> statement-breakpoint
CREATE INDEX "document_signals_user_document_idx" ON "document_signals" USING btree ("user_id","health_document_id");

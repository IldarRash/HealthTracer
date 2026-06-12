-- Replace the health-documents module with the biomarkers (lab reports) model.
-- Pre-launch, disposable DB: the old document tables/enums are dropped outright.

-- ① Drop the chat_attachments -> health_documents link (FK + column).
ALTER TABLE "chat_attachments" DROP COLUMN IF EXISTS "linked_document_id";--> statement-breakpoint

-- ② Drop the document tables (children first, then parent).
DROP TABLE IF EXISTS "document_signals";--> statement-breakpoint
DROP TABLE IF EXISTS "health_document_summaries";--> statement-breakpoint
DROP TABLE IF EXISTS "health_documents";--> statement-breakpoint

-- ③ Drop the six document enums.
DROP TYPE IF EXISTS "public"."document_signal_review_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."document_signal_key";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."document_signal_extraction_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."document_review_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."document_parse_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."document_type";--> statement-breakpoint

-- ④ Create the biomarkers schema.
CREATE TYPE "public"."lab_report_status" AS ENUM('uploaded', 'processing', 'extracted', 'failed');--> statement-breakpoint
CREATE TABLE "lab_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"storage_reference" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"status" "lab_report_status" DEFAULT 'uploaded' NOT NULL,
	"failure_code" text,
	"observed_at" timestamp with time zone,
	"unmapped_marker_count" integer DEFAULT 0 NOT NULL,
	"consent_version" text DEFAULT 'v2' NOT NULL,
	"store_parse_consent_at" timestamp with time zone NOT NULL,
	"coach_context_consent_at" timestamp with time zone,
	"extracted_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biomarker_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lab_report_id" uuid,
	"biomarker_key" text NOT NULL,
	"value" numeric(12, 4),
	"value_text" text,
	"unit" text NOT NULL,
	"reference_range_text" text,
	"observed_at" timestamp with time zone,
	"source" text NOT NULL,
	"confidence" numeric(4, 3),
	"user_edited" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_readings" ADD CONSTRAINT "biomarker_readings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_readings" ADD CONSTRAINT "biomarker_readings_lab_report_id_lab_reports_id_fk" FOREIGN KEY ("lab_report_id") REFERENCES "public"."lab_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_reports_user_uploaded_idx" ON "lab_reports" USING btree ("user_id","uploaded_at");--> statement-breakpoint
CREATE INDEX "lab_reports_user_status_idx" ON "lab_reports" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "lab_reports_user_deleted_idx" ON "lab_reports" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "biomarker_readings_user_key_observed_idx" ON "biomarker_readings" USING btree ("user_id","biomarker_key","observed_at");--> statement-breakpoint
CREATE INDEX "biomarker_readings_lab_report_idx" ON "biomarker_readings" USING btree ("lab_report_id");--> statement-breakpoint
CREATE INDEX "biomarker_readings_user_deleted_idx" ON "biomarker_readings" USING btree ("user_id","deleted_at");

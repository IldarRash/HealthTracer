CREATE TYPE "public"."document_type" AS ENUM('lab_report', 'clinical_note', 'imaging_report', 'medication_list', 'discharge_summary', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_parse_status" AS ENUM('uploaded', 'processing', 'parsed', 'summary_ready', 'failed', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."document_review_status" AS ENUM('pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "health_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"title" text NOT NULL,
	"storage_reference" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"parse_status" "document_parse_status" DEFAULT 'uploaded' NOT NULL,
	"consent_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"consent_version" text DEFAULT 'v1' NOT NULL,
	"consent_granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parse_failure_reason" text,
	"revoked_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_document_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"health_document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"summary_text" text NOT NULL,
	"extracted_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_index_text" text NOT NULL,
	"review_status" "document_review_status" DEFAULT 'pending_review' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generator_version" text DEFAULT 'dev-v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "health_documents" ADD CONSTRAINT "health_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_document_summaries" ADD CONSTRAINT "health_document_summaries_health_document_id_health_documents_id_fk" FOREIGN KEY ("health_document_id") REFERENCES "public"."health_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_document_summaries" ADD CONSTRAINT "health_document_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_documents_user_uploaded_idx" ON "health_documents" USING btree ("user_id","uploaded_at");--> statement-breakpoint
CREATE INDEX "health_documents_user_status_idx" ON "health_documents" USING btree ("user_id","parse_status");--> statement-breakpoint
CREATE INDEX "health_documents_user_deleted_idx" ON "health_documents" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "health_document_summaries_document_idx" ON "health_document_summaries" USING btree ("health_document_id");--> statement-breakpoint
CREATE INDEX "health_document_summaries_user_review_idx" ON "health_document_summaries" USING btree ("user_id","review_status");--> statement-breakpoint
CREATE INDEX "health_document_summaries_search_idx" ON "health_document_summaries" USING btree ("search_index_text");

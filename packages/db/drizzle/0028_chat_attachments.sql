CREATE TYPE "public"."chat_attachment_category" AS ENUM('food_photo', 'medical_document', 'workout_attachment');--> statement-breakpoint
CREATE TYPE "public"."chat_attachment_status" AS ENUM('queued', 'uploading', 'recognizing', 'needs_consent', 'needs_review', 'ready', 'low_confidence', 'unsupported', 'failed');--> statement-breakpoint
CREATE TYPE "public"."chat_attachment_retention_policy" AS ENUM('ephemeral_recognition', 'document_consent_rules', 'session_linked');--> statement-breakpoint
CREATE TABLE "chat_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid,
	"message_id" uuid,
	"category" "chat_attachment_category" NOT NULL,
	"status" "chat_attachment_status" DEFAULT 'queued' NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"storage_key" text,
	"linked_document_id" uuid,
	"linked_image_ref_id" uuid,
	"consent" jsonb,
	"recognition" jsonb,
	"failure_reason" text,
	"retention_policy" "chat_attachment_retention_policy" NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_linked_document_id_health_documents_id_fk" FOREIGN KEY ("linked_document_id") REFERENCES "public"."health_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_attachments_user_id_idx" ON "chat_attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_attachments_thread_id_idx" ON "chat_attachments" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "chat_attachments_message_id_idx" ON "chat_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "chat_attachments_user_status_idx" ON "chat_attachments" USING btree ("user_id","status");

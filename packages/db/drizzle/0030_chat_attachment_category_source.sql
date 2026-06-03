CREATE TYPE "public"."chat_attachment_category_source" AS ENUM('default_unclassified', 'mime_inferred', 'user_selected', 'ai_classified');--> statement-breakpoint
ALTER TABLE "chat_attachments" ADD COLUMN "category_source" "chat_attachment_category_source" DEFAULT 'default_unclassified' NOT NULL;

ALTER TABLE "biomarker_readings" ADD COLUMN "reference_range_low" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "biomarker_readings" ADD COLUMN "reference_range_high" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "biomarker_readings" ADD COLUMN "optimal_range_low" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "biomarker_readings" ADD COLUMN "optimal_range_high" numeric(12, 4);
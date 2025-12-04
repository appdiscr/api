-- Add missing fields to discs table for Issue #5
ALTER TABLE "discs" ADD COLUMN "mold" text;
ALTER TABLE "discs" ADD COLUMN "color" text;
ALTER TABLE "discs" ADD COLUMN "notes" text;

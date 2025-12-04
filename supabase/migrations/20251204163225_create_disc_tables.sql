-- Create enums
CREATE TYPE "public"."photo_type" AS ENUM('top', 'bottom', 'side');
CREATE TYPE "public"."qr_code_status" AS ENUM('generated', 'assigned', 'active', 'deactivated');

-- Create QR codes table
CREATE TABLE "public"."qr_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_code" text NOT NULL,
	"status" "qr_code_status" DEFAULT 'generated' NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qr_codes_short_code_unique" UNIQUE("short_code")
);

-- Create discs table
CREATE TABLE "public"."discs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"qr_code_id" uuid,
	"name" text NOT NULL,
	"manufacturer" text,
	"mold" text,
	"plastic" text,
	"weight" integer,
	"color" text,
	"flight_numbers" jsonb NOT NULL,
	"reward_amount" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create disc photos table
CREATE TABLE "public"."disc_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"disc_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"photo_type" "photo_type" DEFAULT 'top' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "public"."discs" ADD CONSTRAINT "discs_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "public"."discs" ADD CONSTRAINT "discs_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "public"."qr_codes"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "public"."qr_codes" ADD CONSTRAINT "qr_codes_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "public"."disc_photos" ADD CONSTRAINT "disc_photos_disc_id_discs_id_fk" FOREIGN KEY ("disc_id") REFERENCES "public"."discs"("id") ON DELETE cascade ON UPDATE no action;

-- Enable Row Level Security
ALTER TABLE "public"."discs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."disc_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."qr_codes" ENABLE ROW LEVEL SECURITY;

-- RLS Policies for discs table
CREATE POLICY "Users can read own discs"
  ON "public"."discs"
  FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own discs"
  ON "public"."discs"
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own discs"
  ON "public"."discs"
  FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own discs"
  ON "public"."discs"
  FOR DELETE
  USING (auth.uid() = owner_id);

-- RLS Policies for disc_photos table
CREATE POLICY "Users can read photos of own discs"
  ON "public"."disc_photos"
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "public"."discs"
    WHERE "discs"."id" = "disc_photos"."disc_id"
    AND "discs"."owner_id" = auth.uid()
  ));

CREATE POLICY "Users can insert photos for own discs"
  ON "public"."disc_photos"
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM "public"."discs"
    WHERE "discs"."id" = "disc_photos"."disc_id"
    AND "discs"."owner_id" = auth.uid()
  ));

CREATE POLICY "Users can delete photos of own discs"
  ON "public"."disc_photos"
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM "public"."discs"
    WHERE "discs"."id" = "disc_photos"."disc_id"
    AND "discs"."owner_id" = auth.uid()
  ));

-- RLS Policies for qr_codes table (read-only for now)
CREATE POLICY "Users can read qr codes"
  ON "public"."qr_codes"
  FOR SELECT
  USING (true);

-- Create indexes for performance
CREATE INDEX "discs_owner_id_idx" ON "public"."discs"("owner_id");
CREATE INDEX "disc_photos_disc_id_idx" ON "public"."disc_photos"("disc_id");

-- Add comments
COMMENT ON TABLE "public"."discs" IS 'User disc inventory';
COMMENT ON TABLE "public"."disc_photos" IS 'Photos of user discs';
COMMENT ON TABLE "public"."qr_codes" IS 'QR codes for disc linking';

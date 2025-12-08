-- Add push_token column to profiles for Expo Push Notifications
ALTER TABLE "public"."profiles"
ADD COLUMN "push_token" text;

-- Add index for efficient lookup when sending push notifications
CREATE INDEX "profiles_push_token_idx"
ON "public"."profiles" ("push_token")
WHERE push_token IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN "public"."profiles"."push_token"
IS 'Expo Push Token for sending push notifications to this user';

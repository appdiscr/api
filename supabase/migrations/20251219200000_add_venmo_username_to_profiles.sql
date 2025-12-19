-- Add venmo_username column to profiles table for reward payments
-- This stores the user's Venmo username (without @) for receiving disc return rewards

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS venmo_username TEXT;

-- Add a comment explaining the column
COMMENT ON COLUMN profiles.venmo_username IS 'Venmo username (without @) for receiving disc return rewards';

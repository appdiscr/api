-- Add reward payment tracking to recovery_events
-- Allows finder to mark when they've received the reward payment

ALTER TABLE recovery_events
ADD COLUMN IF NOT EXISTS reward_paid_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN recovery_events.reward_paid_at IS 'Timestamp when finder confirmed receiving the reward payment';

-- Add surrendered status to recovery_status enum
ALTER TYPE recovery_status ADD VALUE 'surrendered';

-- Add disc_surrendered notification type
ALTER TYPE notification_type ADD VALUE 'disc_surrendered';

-- Add tracking columns to recovery_events for surrender audit trail
ALTER TABLE recovery_events
ADD COLUMN surrendered_at timestamp with time zone,
ADD COLUMN original_owner_id uuid REFERENCES profiles(id);

-- Add index for efficient queries on surrendered recoveries
CREATE INDEX idx_recovery_events_original_owner
ON recovery_events(original_owner_id)
WHERE original_owner_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN recovery_events.surrendered_at IS 'Timestamp when the disc was surrendered by owner to finder';
COMMENT ON COLUMN recovery_events.original_owner_id IS 'Original owner ID preserved for audit trail after ownership transfer';

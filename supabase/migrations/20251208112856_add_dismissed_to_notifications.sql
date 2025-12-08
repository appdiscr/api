-- Add dismissed column to notifications table
-- Dismissed notifications are hidden from the user but not deleted

ALTER TABLE notifications
ADD COLUMN dismissed boolean NOT NULL DEFAULT false;

-- Create index for efficient filtering
CREATE INDEX idx_notifications_dismissed ON notifications(user_id, dismissed)
WHERE dismissed = false;

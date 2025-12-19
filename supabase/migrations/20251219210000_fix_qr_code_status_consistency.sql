-- Fix QR codes that are linked to discs but have incorrect status
-- This addresses a bug where surrendered discs could end up with QR codes in 'assigned' status
-- instead of 'active' status

-- Fix any QR codes that are linked to a disc but not in 'active' status
UPDATE qr_codes
SET status = 'active',
    updated_at = NOW()
WHERE id IN (
    SELECT qr_code_id
    FROM discs
    WHERE qr_code_id IS NOT NULL
)
AND status != 'active';

-- Also ensure assigned_to matches disc owner for linked QR codes
UPDATE qr_codes
SET assigned_to = discs.owner_id,
    updated_at = NOW()
FROM discs
WHERE qr_codes.id = discs.qr_code_id
AND qr_codes.assigned_to != discs.owner_id;

-- Add a comment explaining the fix
COMMENT ON TABLE qr_codes IS 'QR codes for disc identification. Status should be: generated (unclaimed), assigned (claimed but not linked), active (linked to disc)';

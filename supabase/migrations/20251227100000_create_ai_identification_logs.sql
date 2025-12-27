-- AI Identification Logs: Track AI disc identification results and user corrections
-- Used for improving AI prompts and understanding identification accuracy

CREATE TABLE ai_identification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User context
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Image reference (stored in disc-photos bucket or separate location)
  image_storage_path text,

  -- AI identification results
  ai_manufacturer text,
  ai_mold text,
  ai_confidence numeric(3,2) CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  ai_flight_numbers jsonb, -- {speed, glide, turn, fade}
  ai_plastic text,
  ai_raw_response jsonb, -- Full API response for debugging

  -- User corrections (populated when disc is saved)
  user_manufacturer text,
  user_mold text,
  was_corrected boolean DEFAULT false,

  -- Catalog match info
  catalog_match_id uuid, -- If AI result matched a catalog entry

  -- Performance and debugging
  processing_time_ms integer,
  model_version text DEFAULT 'claude-3-5-sonnet-20241022',

  -- Timestamps
  created_at timestamptz DEFAULT now()
);

-- Indexes for analysis queries
CREATE INDEX idx_ai_logs_user ON ai_identification_logs(user_id);
CREATE INDEX idx_ai_logs_created ON ai_identification_logs(created_at DESC);
CREATE INDEX idx_ai_logs_corrected ON ai_identification_logs(was_corrected) WHERE was_corrected = true;
CREATE INDEX idx_ai_logs_manufacturer ON ai_identification_logs(ai_manufacturer);
CREATE INDEX idx_ai_logs_confidence ON ai_identification_logs(ai_confidence);

-- RLS Policies
ALTER TABLE ai_identification_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own logs
CREATE POLICY "ai_logs_read_own"
  ON ai_identification_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role can do everything (edge functions)
CREATE POLICY "ai_logs_service_all"
  ON ai_identification_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments
COMMENT ON TABLE ai_identification_logs IS 'Tracks AI disc identification attempts for accuracy monitoring and prompt improvement';
COMMENT ON COLUMN ai_identification_logs.ai_confidence IS 'Confidence score from 0.0 to 1.0 returned by the AI model';
COMMENT ON COLUMN ai_identification_logs.was_corrected IS 'True if user changed AI identification when saving the disc';
COMMENT ON COLUMN ai_identification_logs.ai_raw_response IS 'Full JSON response from Claude API for debugging';

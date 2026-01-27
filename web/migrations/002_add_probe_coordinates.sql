-- Add latitude and longitude columns to probes table

ALTER TABLE probes ADD COLUMN latitude REAL;
ALTER TABLE probes ADD COLUMN longitude REAL;

-- Create index for coordinate queries
CREATE INDEX IF NOT EXISTS idx_probes_coordinates ON probes(latitude, longitude);

-- Add source tracking to councils and applications
ALTER TABLE councils    ADD COLUMN source_type   TEXT;
ALTER TABLE councils    ADD COLUMN source_config TEXT;
ALTER TABLE applications ADD COLUMN source_type  TEXT;

-- Sheffield City Council (no planning.data.gov.uk entity_id — Idox source)
INSERT INTO councils (pk_council_id, entity_id, name, reference, source_type, source_config)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'SHF',
  'Sheffield City Council',
  'SHF',
  'idox',
  '{"url":"https://planningapps.sheffield.gov.uk/online-applications"}'
);

-- Backfill existing records as planning_data_gov
UPDATE applications SET source_type = 'planning_data_gov' WHERE source_type IS NULL;

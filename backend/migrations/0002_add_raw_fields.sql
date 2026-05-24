ALTER TABLE applications ADD COLUMN organisation_entity TEXT;
ALTER TABLE applications ADD COLUMN decision_type TEXT;
ALTER TABLE applications ADD COLUMN raw_status TEXT;

CREATE TABLE IF NOT EXISTS councils (
  entity_id  TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  reference  TEXT
);

INSERT OR IGNORE INTO councils (entity_id, name, reference) VALUES
  ('90',  'London Borough of Camden',                  'CMD'),
  ('109', 'Doncaster Metropolitan Borough Council',    'DNC'),
  ('382', 'Worthing Borough Council',                  'WOT'),
  ('26',  'Adur District Council',                     'ADU');

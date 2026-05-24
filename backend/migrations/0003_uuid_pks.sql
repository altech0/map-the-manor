PRAGMA foreign_keys = OFF;

-- Recreate councils with UUID PK
CREATE TABLE councils_new (
  pk_council_id TEXT PRIMARY KEY,
  entity_id     TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  reference     TEXT
);
INSERT INTO councils_new (pk_council_id, entity_id, name, reference) VALUES
  ('6203b4d8-f877-47f6-bb21-52d9309ddbc5', '26',  'Adur District Council',                  'ADU'),
  ('3a85ac5e-b59d-4d31-8eee-0629a697b26f', '109', 'Doncaster Metropolitan Borough Council', 'DNC'),
  ('94820c1c-1672-43a4-b8c8-17c19487824d', '90',  'London Borough of Camden',               'CMD'),
  ('879b10ad-6015-45c0-9354-b5216255d202', '382', 'Worthing Borough Council',               'WOT');
DROP TABLE councils;
ALTER TABLE councils_new RENAME TO councils;

-- Recreate applications with UUID PK and FK
CREATE TABLE applications_new (
  pk_application_id TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  id                TEXT    UNIQUE NOT NULL,
  reference         TEXT,
  address           TEXT,
  description       TEXT,
  status            TEXT    NOT NULL,
  decided_at        TEXT,
  submitted_at      TEXT,
  application_type  TEXT,
  organisation_entity TEXT,
  decision_type     TEXT,
  raw_status        TEXT,
  fk_council_id     TEXT    REFERENCES councils(pk_council_id),
  latitude          REAL    NOT NULL,
  longitude         REAL    NOT NULL,
  synced_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO applications_new
  (id, reference, address, description, status, decided_at, submitted_at,
   application_type, organisation_entity, decision_type, raw_status,
   fk_council_id, latitude, longitude, synced_at)
SELECT
  a.id, a.reference, a.address, a.description, a.status, a.decided_at, a.submitted_at,
  a.application_type, a.organisation_entity, a.decision_type, a.raw_status,
  c.pk_council_id, a.latitude, a.longitude, a.synced_at
FROM applications a
LEFT JOIN councils c ON a.organisation_entity = c.entity_id;
DROP TABLE applications;
ALTER TABLE applications_new RENAME TO applications;

CREATE INDEX IF NOT EXISTS idx_bbox    ON applications (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_date    ON applications (decided_at);
CREATE INDEX IF NOT EXISTS idx_status  ON applications (status);
CREATE INDEX IF NOT EXISTS idx_council ON applications (fk_council_id);

PRAGMA foreign_keys = ON;

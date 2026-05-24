-- Recreate councils with integer PK
CREATE TABLE councils_new (
  pk_council_id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id     TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  reference     TEXT
);
INSERT INTO councils_new (entity_id, name, reference)
  SELECT entity_id, name, reference FROM councils ORDER BY name;
DROP TABLE councils;
ALTER TABLE councils_new RENAME TO councils;

-- Recreate applications with integer PK and FK
CREATE TABLE applications_new (
  pk_application_id INTEGER PRIMARY KEY,
  id                TEXT UNIQUE NOT NULL,
  reference         TEXT,
  address           TEXT,
  description       TEXT,
  status            TEXT NOT NULL,
  decided_at        TEXT,
  submitted_at      TEXT,
  application_type  TEXT,
  organisation_entity TEXT,
  decision_type     TEXT,
  raw_status        TEXT,
  fk_council_id     INTEGER REFERENCES councils(pk_council_id),
  latitude          REAL NOT NULL,
  longitude         REAL NOT NULL,
  synced_at         TEXT NOT NULL DEFAULT (datetime('now'))
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

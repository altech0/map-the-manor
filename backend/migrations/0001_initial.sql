CREATE TABLE IF NOT EXISTS applications (
  id              TEXT PRIMARY KEY,
  reference       TEXT,
  address         TEXT,
  description     TEXT,
  status          TEXT NOT NULL,
  decided_at      TEXT,
  submitted_at    TEXT,
  application_type TEXT,
  latitude        REAL NOT NULL,
  longitude       REAL NOT NULL,
  synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bbox     ON applications (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_date     ON applications (decided_at);
CREATE INDEX IF NOT EXISTS idx_status   ON applications (status);

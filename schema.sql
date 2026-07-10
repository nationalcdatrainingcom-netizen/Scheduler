-- =============================================================================
-- TCC Ratio Scheduler — PostgreSQL schema (Phase 0)
-- Ratios, caps, and separation rules are DATA, not code. Adding school-age or
-- changing a Michigan ratio is an INSERT, never a migration or a redeploy.
-- =============================================================================

CREATE TABLE age_bands (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  min_months  INT NOT NULL,
  max_months  INT NOT NULL,
  sort_order  INT NOT NULL          -- for "youngest child present" comparisons
);

-- Versioned ratio rules. Never UPDATE a rule; insert a new row with a new
-- effective_from and close out the old one's effective_to. History then
-- re-evaluates correctly forever.
CREATE TABLE ratio_rules (
  id                  SERIAL PRIMARY KEY,
  age_band_id         INT NOT NULL REFERENCES age_bands(id),
  children_per_adult  INT NOT NULL,
  jurisdiction        TEXT NOT NULL DEFAULT 'MI',
  effective_from      DATE NOT NULL,
  effective_to        DATE
);

-- Group-size caps depend on SETTING. Indoors they bind; outdoors, NULL = ratio
-- alone governs.
CREATE TABLE group_size_caps (
  age_band_id     INT NOT NULL REFERENCES age_bands(id),
  setting         TEXT NOT NULL CHECK (setting IN ('INDOOR','OUTDOOR')),
  max_children    INT,              -- NULL = uncapped by size
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  PRIMARY KEY (age_band_id, setting, effective_from)
);

CREATE TABLE spaces (
  id                 SERIAL PRIMARY KEY,
  center_id          INT NOT NULL,
  name               TEXT NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('CLASSROOM','GYM','OUTDOOR')),
  physical_capacity  INT              -- bodies the space holds; NULL = unbounded
);

CREATE TABLE rooms (
  id                 SERIAL PRIMARY KEY,
  center_id          INT NOT NULL,
  space_id           INT NOT NULL REFERENCES spaces(id),
  name               TEXT NOT NULL,
  default_band_id    INT NOT NULL REFERENCES age_bands(id),
  licensed_capacity  INT NOT NULL,
  is_combinable      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Which age bands may not share a group, and how hard the rule is.
CREATE TABLE band_separation_policy (
  band_a_id   INT NOT NULL REFERENCES age_bands(id),
  band_b_id   INT NOT NULL REFERENCES age_bands(id),
  severity    TEXT NOT NULL CHECK (severity IN ('LEGAL','POLICY')),
  rationale   TEXT,
  PRIMARY KEY (band_a_id, band_b_id)
);

CREATE TABLE staff (
  id          SERIAL PRIMARY KEY,
  center_id   INT NOT NULL,
  full_name   TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE staff_credentials (
  id          SERIAL PRIMARY KEY,
  staff_id    INT NOT NULL REFERENCES staff(id),
  credential  TEXT NOT NULL,        -- 'LEAD_CAREGIVER','CDA','AIDE','CPR_FA',...
  issued_on   DATE,
  expires_on  DATE                  -- NULL = no expiry
);

CREATE TABLE staff_shifts (
  id         SERIAL PRIMARY KEY,
  staff_id   INT NOT NULL REFERENCES staff(id),
  work_date  DATE NOT NULL,
  starts_at  TIME NOT NULL,
  ends_at    TIME NOT NULL,
  is_float   BOOLEAN NOT NULL DEFAULT FALSE
);

-- MVP stores COUNTS BY BAND — no child PII in this system.
CREATE TABLE room_day_census (
  work_date    DATE NOT NULL,
  room_id      INT NOT NULL REFERENCES rooms(id),
  age_band_id  INT NOT NULL REFERENCES age_bands(id),
  child_count  INT NOT NULL,
  PRIMARY KEY (work_date, room_id, age_band_id)
);

-- A group is a supervision unit in a space over an interval. Baseline = one
-- room; consolidation merges rooms into one group.
CREATE TABLE groups (
  id         SERIAL PRIMARY KEY,
  work_date  DATE NOT NULL,
  space_id   INT NOT NULL REFERENCES spaces(id),
  name       TEXT,
  starts_at  TIME NOT NULL,
  ends_at    TIME NOT NULL,
  origin     TEXT NOT NULL DEFAULT 'BASELINE'  -- BASELINE | CONSOLIDATION | FIELD_TRIP
);
CREATE TABLE group_rooms (
  group_id INT NOT NULL REFERENCES groups(id),
  room_id  INT NOT NULL REFERENCES rooms(id),
  PRIMARY KEY (group_id, room_id)
);
CREATE TABLE group_census (
  group_id     INT NOT NULL REFERENCES groups(id),
  age_band_id  INT NOT NULL REFERENCES age_bands(id),
  child_count  INT NOT NULL,
  PRIMARY KEY (group_id, age_band_id)
);

CREATE TABLE assignments (
  id         SERIAL PRIMARY KEY,
  group_id   INT NOT NULL REFERENCES groups(id),
  staff_id   INT NOT NULL REFERENCES staff(id),
  starts_at  TIME NOT NULL,
  ends_at    TIME NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('TEACHING','BREAK','LUNCH','OFF_FLOOR'))
);

CREATE TABLE callouts (
  id            SERIAL PRIMARY KEY,
  staff_id      INT NOT NULL REFERENCES staff(id),
  work_date     DATE NOT NULL,
  reported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_at  TIME NOT NULL,
  resolution    TEXT
);

-- Every POLICY override is an audit record. No silent dismissals.
CREATE TABLE overrides (
  id             SERIAL PRIMARY KEY,
  work_date      DATE NOT NULL,
  group_id       INT REFERENCES groups(id),
  violation_key  TEXT NOT NULL,
  severity       TEXT NOT NULL,
  overridden_by  INT NOT NULL REFERENCES staff(id),
  reason         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- SEED — Michigan bands & ratios, Peace spaces, rooms, caps, policy
-- =============================================================================

INSERT INTO age_bands (code, label, min_months, max_months, sort_order) VALUES
  ('INFANT_TODDLER', 'Under 2½',    0,  29, 10),
  ('AGE_2_5',        '2½ years',   30,  35, 20),
  ('AGE_3',          '3 years',    36,  47, 30),
  ('AGE_4_5',        '4–5 years',  48,  71, 40),
  ('SCHOOL_AGE',     'School age', 72, 156, 50);

INSERT INTO ratio_rules (age_band_id, children_per_adult, effective_from)
SELECT a.id, r.cpa, DATE '2026-01-01'
FROM age_bands a
JOIN (VALUES ('INFANT_TODDLER',4),('AGE_2_5',8),('AGE_3',10),('AGE_4_5',12),('SCHOOL_AGE',18))
  AS r(code, cpa) ON a.code = r.code;

INSERT INTO group_size_caps (age_band_id, setting, max_children, effective_from)
SELECT a.id, c.setting, c.mx, DATE '2026-01-01'
FROM age_bands a
JOIN (VALUES
  ('INFANT_TODDLER','INDOOR',12),('INFANT_TODDLER','OUTDOOR',NULL),
  ('AGE_3','INDOOR',36),('AGE_3','OUTDOOR',NULL)
) AS c(code, setting, mx) ON a.code = c.code;

INSERT INTO spaces (center_id, name, kind, physical_capacity) VALUES
  (1,'Caterpillars room','CLASSROOM',12),(1,'Butterflies room','CLASSROOM',8),
  (1,'Lions room','CLASSROOM',8),(1,'Dolphins room','CLASSROOM',8),
  (1,'Kangas room','CLASSROOM',8),(1,'Montessori satellite room','CLASSROOM',12),
  (1,'Bears room','CLASSROOM',20),(1,'Tigers room','CLASSROOM',20),
  (1,'Dinos room','CLASSROOM',20),(1,'Penguins room','CLASSROOM',20),
  (1,'Flamingos room','CLASSROOM',30),(1,'Gym','GYM',22),
  (1,'Infant/Toddler playground','OUTDOOR',NULL),
  (1,'Preschool playground','OUTDOOR',NULL),
  (1,'School-age playground','OUTDOOR',NULL);

-- TCC policy: under-2½ not combined with preschool/school-age (overridable).
INSERT INTO band_separation_policy (band_a_id, band_b_id, severity, rationale)
SELECT x.id, y.id, 'POLICY', 'TCC: no under-2½ with older children'
FROM age_bands x, age_bands y
WHERE x.code = 'INFANT_TODDLER' AND y.code IN ('AGE_3','AGE_4_5','SCHOOL_AGE');

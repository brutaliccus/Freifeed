PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT,
  display_name TEXT,
  photo_url TEXT,
  household_id TEXT,
  skipped_baby_onboarding INTEGER NOT NULL DEFAULT 0,
  skipped_photo_onboarding INTEGER NOT NULL DEFAULT 0,
  nav_trackers TEXT,
  home_primary_action TEXT DEFAULT 'nursing',
  ui_scale REAL DEFAULT 1,
  app_theme TEXT DEFAULT 'buba',
  fcm_tokens TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  invite_code TEXT NOT NULL,
  members TEXT NOT NULL,
  owner_uid TEXT,
  member_roles TEXT,
  person_nicknames TEXT,
  member_show_on_home TEXT,
  created_at TEXT,
  invite_rotated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_households_invite ON households(invite_code);

CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS babies (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birth_date TEXT,
  birth_weight_lb REAL,
  birth_weight_oz REAL,
  birth_height_in REAL,
  photo_url TEXT,
  border_color_id TEXT,
  sex TEXT,
  tracker_visibility TEXT,
  show_on_home INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (household_id, id)
);

CREATE TABLE IF NOT EXISTS feedings (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  baby_id TEXT NOT NULL,
  side TEXT,
  start_at TEXT,
  end_at TEXT,
  volume_oz REAL,
  milk_storage TEXT,
  stored_at TEXT,
  milk_lot_id TEXT,
  milk_deductions TEXT,
  weight_lb REAL,
  weight_oz REAL,
  note TEXT,
  last_actor_uid TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id)
);

CREATE INDEX IF NOT EXISTS idx_feedings_household_created
  ON feedings(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedings_household_start
  ON feedings(household_id, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedings_baby
  ON feedings(household_id, baby_id);

CREATE TABLE IF NOT EXISTS milk_lots (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  pumped_at TEXT NOT NULL,
  stored_at TEXT NOT NULL,
  volume_oz REAL NOT NULL,
  remaining_oz REAL NOT NULL,
  storage TEXT NOT NULL,
  feeding_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id)
);

CREATE INDEX IF NOT EXISTS idx_milk_lots_remaining
  ON milk_lots(household_id, remaining_oz);
CREATE INDEX IF NOT EXISTS idx_milk_lots_stored
  ON milk_lots(household_id, stored_at DESC);

CREATE TABLE IF NOT EXISTS diapers (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  baby_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  note TEXT,
  last_actor_uid TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id)
);

CREATE INDEX IF NOT EXISTS idx_diapers_changed
  ON diapers(household_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS medicines (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  for_person_id TEXT NOT NULL,
  name TEXT NOT NULL,
  total_pills INTEGER NOT NULL DEFAULT 0,
  dosage TEXT,
  category TEXT NOT NULL DEFAULT 'required',
  duration_days INTEGER,
  frequency TEXT NOT NULL,
  started_at TEXT,
  last_taken_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id)
);

CREATE INDEX IF NOT EXISTS idx_medicines_created
  ON medicines(household_id, created_at DESC);

CREATE TABLE IF NOT EXISTS measurements (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  baby_id TEXT NOT NULL,
  measured_at TEXT NOT NULL,
  weight_lb REAL,
  weight_oz REAL,
  length_in REAL,
  head_circ_in REAL,
  note TEXT,
  last_actor_uid TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id)
);

CREATE INDEX IF NOT EXISTS idx_measurements_measured
  ON measurements(household_id, measured_at DESC);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  for_person_id TEXT,
  for_person_ids TEXT,
  baby_id TEXT,
  kind TEXT NOT NULL DEFAULT 'todo',
  text TEXT NOT NULL,
  details TEXT,
  scheduled_at TEXT,
  reminder_minutes_before INTEGER,
  recurrence TEXT,
  invitee_person_ids TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  last_archived_occurrence_at TEXT,
  last_actor_uid TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id)
);

CREATE INDEX IF NOT EXISTS idx_notes_created
  ON notes(household_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

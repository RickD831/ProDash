CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(100) DEFAULT 'Planning',
  division VARCHAR(100) DEFAULT '',
  funding_sources TEXT[] DEFAULT '{}',
  project_manager VARCHAR(255) DEFAULT '',
  team TEXT[] DEFAULT '{}',
  start_date DATE,
  end_date DATE,
  level_of_effort VARCHAR(100) DEFAULT '',
  notes TEXT DEFAULT '',
  hide_from_timeline BOOLEAN DEFAULT FALSE,
  custom_fields JSONB DEFAULT '{}',
  budget_total DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cost_items (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE,
  description TEXT DEFAULT '',
  category VARCHAR(100) DEFAULT '',
  amount DECIMAL(12,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) DEFAULT '',
  url TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) DEFAULT '',
  start_date DATE,
  end_date DATE,
  status VARCHAR(100) DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);

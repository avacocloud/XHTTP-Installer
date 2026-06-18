CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  label TEXT NOT NULL,
  token_data TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  token_id INTEGER REFERENCES platform_tokens(id),
  project_name TEXT NOT NULL,
  deploy_url TEXT,
  target_domain TEXT NOT NULL,
  relay_path TEXT DEFAULT '/api',
  public_path TEXT DEFAULT '/api',
  status TEXT DEFAULT 'pending',
  sku TEXT,
  resource_group TEXT,
  config_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id INTEGER REFERENCES deployments(id),
  status_code INTEGER,
  response_time_ms INTEGER,
  checked_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  inbound_tag TEXT NOT NULL,
  traffic_limit INTEGER DEFAULT 0,
  traffic_up INTEGER DEFAULT 0,
  traffic_down INTEGER DEFAULT 0,
  expiry_date TEXT,
  max_ips INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  flow TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_uuid_inbound ON clients(uuid, inbound_tag);
CREATE INDEX IF NOT EXISTS idx_clients_inbound ON clients(inbound_tag);
CREATE INDEX IF NOT EXISTS idx_clients_enabled ON clients(enabled);

CREATE TABLE IF NOT EXISTS client_traffic_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  upload INTEGER DEFAULT 0,
  download INTEGER DEFAULT 0,
  recorded_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_traffic_history_client ON client_traffic_history(client_id);
CREATE INDEX IF NOT EXISTS idx_traffic_history_date ON client_traffic_history(recorded_at);

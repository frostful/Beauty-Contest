CREATE TABLE IF NOT EXISTS player_profiles (
  player_id TEXT PRIMARY KEY,
  avatar TEXT NOT NULL DEFAULT 'diamond',
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS round_results (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  round INTEGER NOT NULL,
  player_count INTEGER NOT NULL,
  average REAL NOT NULL,
  target REAL NOT NULL,
  winner_id TEXT,
  winner_name TEXT NOT NULL,
  exact_hit INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(room_code) REFERENCES rooms(code) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS round_entries (
  round_result_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  pick INTEGER NOT NULL,
  distance REAL NOT NULL,
  round_delta INTEGER NOT NULL,
  score_after INTEGER NOT NULL,
  won INTEGER NOT NULL DEFAULT 0,
  invalid INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(round_result_id, player_id),
  FOREIGN KEY(round_result_id) REFERENCES round_results(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_round_results_room_created ON round_results(room_code, created_at);
CREATE INDEX IF NOT EXISTS idx_round_results_created ON round_results(created_at);
CREATE INDEX IF NOT EXISTS idx_round_entries_player ON round_entries(player_id);

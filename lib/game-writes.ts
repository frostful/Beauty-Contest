// Keep room-state checks in the write itself: another request may have moved
// the room on since the route read its snapshot.
export const LOCK_PICK_SQL = `UPDATE players SET pick=?, submitted=1, last_seen=?
WHERE id=? AND alive=1 AND submitted=0
AND EXISTS (SELECT 1 FROM rooms WHERE code=players.room_code
  AND round=? AND status='playing' AND deadline>?)`;

export const JOIN_PLAYER_SQL = `INSERT INTO players (id, room_code, name, token, alive, joined_at, last_seen)
SELECT ?, ?, ?, ?, ?, ?, ?
WHERE EXISTS (SELECT 1 FROM rooms WHERE code=?
  AND (status='lobby' OR (?=1 AND status!='finished')))`;

export const RESET_START_PLAYERS_SQL = `UPDATE players
SET score=0, alive=CASE WHEN token LIKE 'spectator_%' THEN 0 ELSE 1 END,
  pick=NULL, submitted=0, invalid=0, round_delta=0
WHERE room_code=? AND EXISTS (SELECT 1 FROM rooms WHERE code=? AND status='lobby' AND host_token=?)
AND (SELECT COUNT(*) FROM players WHERE room_code=? AND token NOT LIKE 'spectator_%')=?`;

export const START_ROOM_SQL = `UPDATE rooms SET status=?, round=1, initial_players=?, deadline=?,
resolving_at=NULL, result_started_at=NULL, average=NULL, target=NULL,
winner_id=NULL, winner_name=NULL, message=?
WHERE code=? AND status='lobby' AND host_token=?
AND (SELECT COUNT(*) FROM players WHERE room_code=? AND token NOT LIKE 'spectator_%')=?`;

import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  hostToken: text("host_token").notNull(),
  status: text("status").notNull().default("lobby"),
  round: integer("round").notNull().default(0),
  initialPlayers: integer("initial_players").notNull().default(0),
  roundSeconds: integer("round_seconds").notNull().default(180),
  deadline: integer("deadline"),
  resolvingAt: integer("resolving_at"),
  resultStartedAt: integer("result_started_at"),
  average: real("average"),
  target: real("target"),
  winnerId: text("winner_id"),
  winnerName: text("winner_name"),
  exactHit: integer("exact_hit").notNull().default(0),
  message: text("message"),
  createdAt: integer("created_at").notNull(),
});

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  roomCode: text("room_code").notNull().references(() => rooms.code, { onDelete: "cascade" }),
  name: text("name").notNull(),
  token: text("token").notNull().unique(),
  isHost: integer("is_host").notNull().default(0),
  score: integer("score").notNull().default(0),
  alive: integer("alive").notNull().default(1),
  pick: integer("pick"),
  submitted: integer("submitted").notNull().default(0),
  invalid: integer("invalid").notNull().default(0),
  roundDelta: integer("round_delta").notNull().default(0),
  joinedAt: integer("joined_at").notNull(),
  lastSeen: integer("last_seen").notNull(),
}, (table) => [
  index("idx_players_room").on(table.roomCode, table.alive, table.joinedAt),
  uniqueIndex("idx_players_room_name").on(table.roomCode, table.name),
]);

export const playerProfiles = sqliteTable("player_profiles", {
  playerId: text("player_id").primaryKey().references(() => players.id, { onDelete: "cascade" }),
  avatar: text("avatar").notNull().default("diamond"),
});

export const roundResults = sqliteTable("round_results", {
  id: text("id").primaryKey(),
  roomCode: text("room_code").notNull().references(() => rooms.code, { onDelete: "cascade" }),
  round: integer("round").notNull(),
  playerCount: integer("player_count").notNull(),
  average: real("average").notNull(),
  target: real("target").notNull(),
  winnerId: text("winner_id"),
  winnerName: text("winner_name").notNull(),
  exactHit: integer("exact_hit").notNull().default(0),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("idx_round_results_room_created").on(table.roomCode, table.createdAt),
  index("idx_round_results_created").on(table.createdAt),
]);

export const roundEntries = sqliteTable("round_entries", {
  roundResultId: text("round_result_id").notNull().references(() => roundResults.id, { onDelete: "cascade" }),
  playerId: text("player_id").notNull(),
  playerName: text("player_name").notNull(),
  avatar: text("avatar").notNull(),
  pick: integer("pick").notNull(),
  distance: real("distance").notNull(),
  roundDelta: integer("round_delta").notNull(),
  scoreAfter: integer("score_after").notNull(),
  won: integer("won").notNull().default(0),
  invalid: integer("invalid").notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.roundResultId, table.playerId] }),
  index("idx_round_entries_player").on(table.playerId),
]);

CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`name` text NOT NULL,
	`token` text NOT NULL,
	`is_host` integer DEFAULT 0 NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`alive` integer DEFAULT 1 NOT NULL,
	`pick` integer,
	`submitted` integer DEFAULT 0 NOT NULL,
	`invalid` integer DEFAULT 0 NOT NULL,
	`round_delta` integer DEFAULT 0 NOT NULL,
	`joined_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_token_unique` ON `players` (`token`);--> statement-breakpoint
CREATE INDEX `idx_players_room` ON `players` (`room_code`,`alive`,`joined_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_players_room_name` ON `players` (`room_code`,`name`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_token` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`round` integer DEFAULT 0 NOT NULL,
	`initial_players` integer DEFAULT 0 NOT NULL,
	`round_seconds` integer DEFAULT 180 NOT NULL,
	`deadline` integer,
	`average` real,
	`target` real,
	`winner_id` text,
	`winner_name` text,
	`exact_hit` integer DEFAULT 0 NOT NULL,
	`message` text,
	`created_at` integer NOT NULL
);

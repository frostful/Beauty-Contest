CREATE TABLE IF NOT EXISTS `player_profiles` (
	`player_id` text PRIMARY KEY NOT NULL,
	`avatar` text DEFAULT 'diamond' NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `round_entries` (
	`round_result_id` text NOT NULL,
	`player_id` text NOT NULL,
	`player_name` text NOT NULL,
	`avatar` text NOT NULL,
	`pick` integer NOT NULL,
	`distance` real NOT NULL,
	`round_delta` integer NOT NULL,
	`score_after` integer NOT NULL,
	`won` integer DEFAULT 0 NOT NULL,
	`invalid` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`round_result_id`, `player_id`),
	FOREIGN KEY (`round_result_id`) REFERENCES `round_results`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_round_entries_player` ON `round_entries` (`player_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `round_results` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`round` integer NOT NULL,
	`player_count` integer NOT NULL,
	`average` real NOT NULL,
	`target` real NOT NULL,
	`winner_id` text,
	`winner_name` text NOT NULL,
	`exact_hit` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_round_results_room_created` ON `round_results` (`room_code`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_round_results_created` ON `round_results` (`created_at`);--> statement-breakpoint
ALTER TABLE `rooms` ADD `resolving_at` integer;--> statement-breakpoint
ALTER TABLE `rooms` ADD `result_started_at` integer;

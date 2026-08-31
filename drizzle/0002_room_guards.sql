CREATE TRIGGER IF NOT EXISTS `players_contestant_capacity`
BEFORE INSERT ON `players`
WHEN NEW.`token` NOT LIKE 'spectator_%'
  AND (SELECT COUNT(*) FROM `players` WHERE `room_code` = NEW.`room_code` AND `token` NOT LIKE 'spectator_%') >= 5
BEGIN
  SELECT RAISE(ABORT, 'room_full');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `players_spectator_capacity`
BEFORE INSERT ON `players`
WHEN NEW.`token` LIKE 'spectator_%'
  AND (SELECT COUNT(*) FROM `players` WHERE `room_code` = NEW.`room_code` AND `token` LIKE 'spectator_%') >= 24
BEGIN
  SELECT RAISE(ABORT, 'gallery_full');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `players_valid_locked_pick_insert`
BEFORE INSERT ON `players`
WHEN NEW.`submitted` = 1 AND (NEW.`pick` IS NULL OR NEW.`pick` < 0 OR NEW.`pick` > 100 OR NEW.`pick` != CAST(NEW.`pick` AS INTEGER))
BEGIN
  SELECT RAISE(ABORT, 'invalid_pick');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `players_valid_locked_pick_update`
BEFORE UPDATE OF `pick`, `submitted` ON `players`
WHEN NEW.`submitted` = 1 AND (NEW.`pick` IS NULL OR NEW.`pick` < 0 OR NEW.`pick` > 100 OR NEW.`pick` != CAST(NEW.`pick` AS INTEGER))
BEGIN
  SELECT RAISE(ABORT, 'invalid_pick');
END;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_players_single_host`
ON `players` (`room_code`)
WHERE `is_host` = 1;

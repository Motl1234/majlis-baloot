CREATE TABLE `room_players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`seat` integer NOT NULL,
	`display_name` text NOT NULL,
	`avatar` text DEFAULT 'sword' NOT NULL,
	`session_hash` text,
	`is_bot` integer DEFAULT false NOT NULL,
	`is_ready` integer DEFAULT true NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`client_instance_id` text,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_players_room_seat_unique` ON `room_players` (`room_id`,`seat`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_players_session_hash_unique` ON `room_players` (`session_hash`);--> statement-breakpoint
CREATE INDEX `room_players_room_idx` ON `room_players` (`room_id`);--> statement-breakpoint
CREATE INDEX `room_players_last_seen_idx` ON `room_players` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`host_player_id` text NOT NULL,
	`ruleset_version` integer DEFAULT 1 NOT NULL,
	`game_version` integer DEFAULT 0 NOT NULL,
	`presence_version` integer DEFAULT 0 NOT NULL,
	`state_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_code_unique` ON `rooms` (`code`);--> statement-breakpoint
CREATE INDEX `rooms_status_updated_idx` ON `rooms` (`status`,`updated_at`);
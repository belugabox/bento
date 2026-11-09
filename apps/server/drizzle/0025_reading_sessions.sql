CREATE TABLE `reading_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`volume_id` integer,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`pages` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'bento' NOT NULL,
	`external_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`volume_id`) REFERENCES `volumes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_sessions_external_id_unique` ON `reading_sessions` (`external_id`);--> statement-breakpoint
CREATE INDEX `reading_sessions_user` ON `reading_sessions` (`user_id`,`started_at`);
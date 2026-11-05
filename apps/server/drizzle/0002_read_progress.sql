CREATE TABLE `read_progress` (
	`user_id` integer NOT NULL,
	`volume_id` integer NOT NULL,
	`page` integer NOT NULL,
	`completed` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `volume_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`volume_id`) REFERENCES `volumes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `read_progress_recent` ON `read_progress` (`user_id`,`updated_at`);
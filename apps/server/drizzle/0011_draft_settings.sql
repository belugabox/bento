PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_draft_statuses` (
	`library_id` integer NOT NULL,
	`folder` text NOT NULL,
	`status` text,
	`reading_mode` text,
	`cover_updated_at` integer,
	PRIMARY KEY(`library_id`, `folder`),
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_draft_statuses`("library_id", "folder", "status") SELECT "library_id", "folder", "status" FROM `draft_statuses`;--> statement-breakpoint
DROP TABLE `draft_statuses`;--> statement-breakpoint
ALTER TABLE `__new_draft_statuses` RENAME TO `draft_statuses`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
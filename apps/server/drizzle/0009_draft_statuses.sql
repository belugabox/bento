CREATE TABLE `draft_statuses` (
	`library_id` integer NOT NULL,
	`folder` text NOT NULL,
	`status` text NOT NULL,
	PRIMARY KEY(`library_id`, `folder`),
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade
);

ALTER TABLE `invitations` ADD `invited_by` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `invited_by` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `pending_since` integer;
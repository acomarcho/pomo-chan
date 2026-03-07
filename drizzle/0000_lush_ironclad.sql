CREATE TABLE `session_app_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`app_name` text NOT NULL,
	`window_title` text,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_app_usage_session_id` ON `session_app_usage` (`session_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`focus_seconds` integer
);

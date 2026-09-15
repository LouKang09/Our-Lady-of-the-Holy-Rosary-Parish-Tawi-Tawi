ALTER TABLE `accounts` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `access_role` text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `committee` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `disabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- Before staff accounts existed, every account was created by the one-time owner setup.
UPDATE accounts SET access_role='owner';

-- Add status column to results table
-- Older DBs may already have this; migration is tracked by schema_migrations.

ALTER TABLE results ADD COLUMN status TEXT DEFAULT 'success';

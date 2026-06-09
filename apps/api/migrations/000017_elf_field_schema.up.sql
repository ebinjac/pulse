ALTER TABLE elf_queries
    ADD COLUMN IF NOT EXISTS field_schema_json JSONB NOT NULL DEFAULT '{}'::jsonb;

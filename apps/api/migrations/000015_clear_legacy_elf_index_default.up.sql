UPDATE system_settings
SET value_json = value_json || '{"indexPathTemplate":""}'::jsonb
WHERE key = 'elfProxy'
  AND COALESCE(value_json->>'indexPathTemplate', '') = '*:elf-{{elfAppId}}-*';

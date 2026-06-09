UPDATE system_settings
SET value_json = value_json || '{"indexPathTemplate":"*:elf-{{elfAppId}}-*"}'::jsonb
WHERE key = 'elfProxy'
  AND COALESCE(value_json->>'indexPathTemplate', '') = '';

CREATE TABLE IF NOT EXISTS certificate_profiles (
    id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 443,
    cert_type VARCHAR(32) NOT NULL DEFAULT 'pem',
    cert_secret_alias VARCHAR(255),
    key_secret_alias VARCHAR(255),
    pfx_secret_alias VARCHAR(255),
    ca_cert_secret_alias VARCHAR(255),
    passphrase_secret_alias VARCHAR(255),
    insecure_skip_verify BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_tested_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (host, port)
);

CREATE INDEX IF NOT EXISTS idx_certificate_profiles_host_port
ON certificate_profiles (host, port)
WHERE is_active = TRUE;

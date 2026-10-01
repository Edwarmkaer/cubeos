CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
    subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 256),
    UNIQUE (provider, subject)
);
CREATE INDEX auth_identities_user_idx ON auth_identities(user_id);
CREATE TABLE devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    protocol_device_id text NOT NULL CHECK (protocol_device_id ~ '^[A-Z0-9_-]{2,12}$'),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_owner_idx ON devices(owner_user_id);
CREATE TABLE ingestion_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    transport text NOT NULL CHECK (transport IN ('serial', 'http')),
    external_gateway_id text,
    credential_hash text NOT NULL CHECK (credential_hash ~ '^[0-9a-f]{64}$'),
    revoked_at timestamptz,
    UNIQUE (credential_hash)
);
CREATE INDEX ingestion_sources_device_idx ON ingestion_sources(device_id);

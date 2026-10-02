CREATE TABLE media_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
 owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 credential_hash text NOT NULL UNIQUE CHECK (credential_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz
);
CREATE INDEX media_credentials_device_idx ON media_credentials(device_id);
CREATE TABLE photos (
 id uuid PRIMARY KEY,
 device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
 storage_backend text NOT NULL CHECK (storage_backend IN ('local','s3')),
 original_key text NOT NULL UNIQUE,
 thumbnail_key text UNIQUE,
 content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png')),
 size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 268435456),
 width_px integer NOT NULL CHECK (width_px > 0),
 height_px integer NOT NULL CHECK (height_px > 0),
 sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
 captured_at timestamptz,
 imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 import_method text NOT NULL CHECK (import_method IN ('manual','http')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready'))
);
CREATE INDEX photos_device_import_idx ON photos(device_id,imported_at DESC,id DESC);

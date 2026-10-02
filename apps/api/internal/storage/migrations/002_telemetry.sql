-- Raw receptions are evidence; logical samples and projection decisions are
-- explicit, so retransmissions/rejections never masquerade as new samples.
CREATE TABLE received_packets (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id uuid REFERENCES devices(id) ON DELETE CASCADE,
    source_id uuid REFERENCES ingestion_sources(id) ON DELETE SET NULL,
    attempted_source text NOT NULL CHECK (length(attempted_source) <= 128),
    received_at timestamptz NOT NULL,
    raw_payload bytea NOT NULL CHECK (octet_length(raw_payload) <= 8192),
    raw_size bigint NOT NULL CHECK (raw_size >= 0),
    raw_truncated boolean NOT NULL,
    raw_sha256 text NOT NULL CHECK (raw_sha256 ~ '^[0-9a-f]{64}$'),
    canonical_sha256 text,
    status text NOT NULL CHECK (status IN ('accepted','duplicated','rejected')),
    cause text NOT NULL,
    reception_epoch bigint CHECK (reception_epoch >= 0),
    message_type text CHECK (message_type IN ('H','E','O','I','G')),
    sequence bigint CHECK (sequence BETWEEN 0 AND 4294967295),
    uptime_ms bigint CHECK (uptime_ms BETWEEN 0 AND 4294967295),
    normalized_payload jsonb,
    receiver_metadata jsonb NOT NULL,
    logical boolean NOT NULL DEFAULT false,
    projected boolean NOT NULL DEFAULT false,
    CHECK (NOT logical OR (status='accepted' AND device_id IS NOT NULL AND reception_epoch IS NOT NULL AND message_type IS NOT NULL AND sequence IS NOT NULL AND normalized_payload IS NOT NULL)),
    CHECK (NOT projected OR logical)
);
CREATE UNIQUE INDEX packet_logical_identity ON received_packets(device_id,reception_epoch,message_type,sequence) WHERE logical;
CREATE INDEX packet_history ON received_packets(device_id,id);
CREATE INDEX packet_history_group ON received_packets(device_id,message_type,id);
CREATE INDEX packet_history_time ON received_packets(device_id,received_at,id);
CREATE INDEX packet_fingerprint ON received_packets(device_id,message_type,sequence,canonical_sha256) WHERE logical;
CREATE TABLE device_telemetry_state (
    device_id uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
    order_state jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE device_snapshots (
    device_id uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    projection jsonb NOT NULL,
    updated_at timestamptz NOT NULL
);

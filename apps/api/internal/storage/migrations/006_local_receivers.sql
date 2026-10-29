-- A local receiver is an explicit installation binding, not a flight ID lookup.
CREATE TABLE local_receivers (
    id uuid PRIMARY KEY,
    device_id uuid NOT NULL UNIQUE REFERENCES devices(id),
    source_id uuid NOT NULL UNIQUE REFERENCES ingestion_sources(id)
);

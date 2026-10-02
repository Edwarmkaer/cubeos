CREATE TABLE steps (
    id uuid PRIMARY KEY,
    title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    instructions text NOT NULL CHECK (length(btrim(instructions)) BETWEEN 1 AND 10000),
    display_order integer NOT NULL CHECK (display_order >= 0)
);
CREATE TABLE step_progress (
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    step_id uuid NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
    completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (device_id, step_id)
);

-- Bundles may include every scheduled medication, not only a pair.
CREATE TABLE med_bundle_items_n (
    bundle_id TEXT NOT NULL REFERENCES med_bundles(id) ON DELETE CASCADE,
    medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (bundle_id, medication_id)
);

INSERT INTO med_bundle_items_n (bundle_id, medication_id, position)
SELECT bundle_id, medication_id, position FROM med_bundle_items;

DROP TABLE med_bundle_items;
ALTER TABLE med_bundle_items_n RENAME TO med_bundle_items;

CREATE UNIQUE INDEX IF NOT EXISTS idx_med_bundle_items_position
    ON med_bundle_items(bundle_id, position);

-- SQL statements to add characteristics_id column to demographic tables
-- Run these in your Neon database console

-- 1. Add characteristics_id to demographic_stats table
ALTER TABLE demographic_stats 
ADD COLUMN characteristics_id TEXT;

-- Populate characteristics_id from demographic_categories via category_id
UPDATE demographic_stats ds
SET characteristics_id = dc.characteristics_id
FROM demographic_categories dc
WHERE ds.category_id = dc.id;

-- 2. Add characteristics_id to demographic_importance table
ALTER TABLE demographic_importance 
ADD COLUMN characteristics_id TEXT;

-- Populate characteristics_id from demographic_categories via category_id
UPDATE demographic_importance di
SET characteristics_id = dc.characteristics_id
FROM demographic_categories dc
WHERE di.category_id = dc.id;

-- 3. Add characteristics_id to demographics_geographic table
ALTER TABLE demographics_geographic 
ADD COLUMN characteristics_id TEXT;

-- Populate characteristics_id from demographic_categories via category_id
UPDATE demographics_geographic dg
SET characteristics_id = dc.characteristics_id
FROM demographic_categories dc
WHERE dg.category_id = dc.id;

-- Optional: Create indexes for faster filtering by characteristics_id
CREATE INDEX idx_demographic_stats_characteristics_id ON demographic_stats(characteristics_id);
CREATE INDEX idx_demographic_importance_characteristics_id ON demographic_importance(characteristics_id);
CREATE INDEX idx_demographics_geographic_characteristics_id ON demographics_geographic(characteristics_id);

-- Verify the updates
SELECT 
    'demographic_stats' as table_name,
    COUNT(*) as total_rows,
    COUNT(characteristics_id) as rows_with_characteristics_id,
    COUNT(DISTINCT characteristics_id) as unique_characteristics_ids
FROM demographic_stats
UNION ALL
SELECT 
    'demographic_importance',
    COUNT(*),
    COUNT(characteristics_id),
    COUNT(DISTINCT characteristics_id)
FROM demographic_importance
UNION ALL
SELECT 
    'demographics_geographic',
    COUNT(*),
    COUNT(characteristics_id),
    COUNT(DISTINCT characteristics_id)
FROM demographics_geographic;

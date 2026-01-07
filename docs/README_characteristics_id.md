# Adding characteristics_id to Demographic Tables

## Summary

Added `characteristics_id` column to all three demographic tables for easier filtering:

- ✅ `demographic_categories` (already had it)
- ✅ `demographic_stats` (added)
- ✅ `demographic_importance` (added)
- ✅ `demographics_geographic` (added)

## Changes Made

### 1. Schema Updates (schema.ts)

Updated TypeScript schema definitions to include `characteristics_id` field:

- `demographic_stats`: Added `characteristicsId: text('characteristics_id')`
- `demographic_importance`: Added `characteristicsId: text('characteristics_id')`
- `demographics_geographic`: Added `characteristicsId: text('characteristics_id')`

### 2. Migration Script Updates (demographics.py)

Updated the data migration script to populate `characteristics_id` when inserting records:

- Line ~660: Added `"characteristics_id": str(char_id)` to demographic_stats
- Line ~549: Added `"characteristics_id": str(char_id)` to demographic_importance
- Line ~1137: Added `"characteristics_id": str(char_id)` to demographics_geographic

### 3. SQL Migration Script (add_characteristics_id.sql)

Created SQL script to add columns to existing database and populate them:

```sql
-- Adds characteristics_id column to all three tables
-- Populates values from demographic_categories via category_id join
-- Creates indexes for better query performance
-- Includes verification query
```

### 4. Filter Script Enhancement (filter.py)

Enhanced the filter script to work with any demographic table:

```python
filter_demographics_to_csv(
    characteristics_ids=["2255", "2256", "2257"],
    table_name="demographics_geographic"  # or other tables
)
```

## How to Apply Changes

### Option 1: Run SQL Script in Neon (Recommended for existing data)

1. Open your Neon database console
2. Copy and paste the contents of `add_characteristics_id.sql`
3. Run the script - it will:
   - Add the columns
   - Populate them with values from demographic_categories
   - Create indexes for performance
   - Show verification results

### Option 2: Re-run Migration Script (For fresh migration)

If you need to re-migrate the data:

```bash
cd e:\Poliwave\interactive-model\neon\new_upload_scripts
python demographics.py
```

## Using the Filter Script

### Filter demographics by characteristics IDs:

```python
from filter import filter_demographics_to_csv

# Filter occupation demographics (Sales, Trades, Natural resources)
target_ids = ["2255", "2256", "2257"]

# From demographics_geographic (default)
filter_demographics_to_csv(target_ids)

# From demographic_categories
filter_demographics_to_csv(target_ids, table_name="demographic_categories")

# From demographic_stats
filter_demographics_to_csv(target_ids, table_name="demographic_stats")

# From demographic_importance
filter_demographics_to_csv(target_ids, table_name="demographic_importance")
```

### Command line usage:

```bash
cd e:\Poliwave\interactive-model\neon\data_management
python filter.py
```

## SQL Query Examples

Now you can filter any demographic table easily:

```sql
-- Filter demographics_geographic
SELECT * FROM demographics_geographic
WHERE characteristics_id IN ('2255', '2256', '2257')
ORDER BY characteristics_id, constituency_id;

-- Filter demographic_stats
SELECT * FROM demographic_stats
WHERE characteristics_id IN ('2255', '2256', '2257')
ORDER BY characteristics_id;

-- Filter demographic_importance
SELECT * FROM demographic_importance
WHERE characteristics_id IN ('2255', '2256', '2257')
ORDER BY characteristics_id;

-- Filter demographic_categories
SELECT * FROM demographic_categories
WHERE characteristics_id IN ('2255', '2256', '2257')
ORDER BY characteristics_id;

-- Get all related data for specific characteristics
SELECT
    dc.characteristics_id,
    dc.category,
    dc.subcategory,
    di.importance,
    di.demo_category,
    ds.stats->>'mean' as mean,
    COUNT(dg.id) as geographic_records
FROM demographic_categories dc
LEFT JOIN demographic_importance di ON dc.id = di.category_id
LEFT JOIN demographic_stats ds ON dc.id = ds.category_id
LEFT JOIN demographics_geographic dg ON dc.id = dg.category_id
WHERE dc.characteristics_id IN ('2255', '2256', '2257')
GROUP BY dc.characteristics_id, dc.category, dc.subcategory,
         di.importance, di.demo_category, ds.stats
ORDER BY dc.characteristics_id;
```

## Benefits

1. **Easier Filtering**: No need to join with demographic_categories every time
2. **Better Performance**: Direct filtering with indexes
3. **Simpler Queries**: One WHERE clause instead of complex joins
4. **Consistency**: Same filtering mechanism across all demographic tables
5. **Backward Compatible**: All existing queries still work via category_id

## Characteristics IDs Reference

The three occupation characteristics you wanted:

- **2255**: Sales and service occupations (4,616,050 people)
- **2256**: Trades, transport and equipment operators (3,239,500 people)
- **2257**: Natural resources, agriculture and related production occupations

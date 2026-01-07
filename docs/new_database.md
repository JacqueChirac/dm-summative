# PoliWave Database Schema Documentation

**Last Updated**: October 4, 2025  
**Database Type**: PostgreSQL (Neon)  
**ORM**: Drizzle ORM

---

## Table of Contents

1. [Overview](#overview)
2. [Table Index](#table-index)
3. [Core Geographic & Political Structure](#core-geographic--political-structure)
4. [Electoral Data](#electoral-data)
5. [Polling Data](#polling-data)
6. [Projection Data](#projection-data)
7. [Demographics Data](#demographics-data)
8. [Relationships Diagram](#relationships-diagram)
9. [Key Design Patterns](#key-design-patterns)

---

## Table Index

| **✅ Documented Tables**      | **❌ Not Yet Documented**   |
| ----------------------------- | --------------------------- |
| **Core Structure**            | **Missing Tables**          |
| ✅ `countries`                | ❌ `demographic_importance` |
| ✅ `jurisdictions`            | ❌ _Add others as needed_   |
| ✅ `regions`                  |
| ✅ `parties`                  |
| ✅ `constituencies`           |
| **Electoral**                 |
| ✅ `elections`                |
| ✅ `election_results`         |
| ✅ `election_results_regions` |
| **Polling**                   |
| ✅ `pollsters`                |
| ✅ `polls`                    |
| ✅ `poll_questions`           |
| ✅ `poll_results`             |
| ✅ `poll_options`             |
| **Projections**               |
| ✅ `projections_election`     |
| ✅ `projections_general`      |
| ✅ `projections_regional`     |
| ✅ `projections_constituency` |
| ✅ `projections_accuracy`     |
| **Demographics**              |
| ✅ `censuses`                 |
| ✅ `demographic_categories`   |
| ✅ `demographics_geographic`  |
| ✅ `demographic_stats`        |
| ✅ `demographic_importance`   |

---

## Overview

The PoliWave database is designed to support multi-jurisdictional electoral analysis, polling aggregation, and election projections. It supports:

- **Multi-country/multi-jurisdiction** electoral systems (Canada Federal, Provincial, US, etc.)
- **Hierarchical regional structures** (Country → Jurisdiction → Regions → Constituencies)
- **Historical election results** with constituency-level and regional aggregations
- **Polling data** with demographic and regional filtering
- **Monte Carlo projection models** with probability distributions
- **Accuracy tracking** for projection performance

---

## Core Geographic & Political Structure

### `countries`

**Purpose**: Top-level container for national entities

| Column | Type   | Description                        |
| ------ | ------ | ---------------------------------- |
| `id`   | SERIAL | Primary key                        |
| `name` | TEXT   | Full country name (e.g., "Canada") |
| `code` | TEXT   | ISO-style code (e.g., "CA")        |

**Relationships**:

- One-to-many with `jurisdictions`

---

### `jurisdictions`

**Purpose**: Electoral jurisdictions within countries (Federal, Provincial, State-level)

| Column             | Type    | Description                            |
| ------------------ | ------- | -------------------------------------- |
| `id`               | SERIAL  | Primary key                            |
| `country_id`       | INTEGER | References `countries.id`              |
| `name`             | TEXT    | Full name (e.g., "Federal Canada")     |
| `code`             | TEXT    | Short code (e.g., "FED", "BC", "AB")   |
| `type`             | TEXT    | Type: "Federal", "Provincial", "State" |
| `electoral_system` | ENUM    | FPTP, PR, STV, IRV, MMP, etc.          |
| `seat_count`       | INTEGER | Total seats in jurisdiction            |
| `order_index`      | INTEGER | Display ordering                       |

**Key Notes**:

- **Same code across countries**: "FED" exists for CA, US, DE, etc.
- **Jurisdiction matching requires country context**: Use `(country_code, jurisdiction_code)` tuples

**Relationships**:

- Belongs to one `country`
- Has many `regions`, `constituencies`, `elections`, `parties`, `polls`, `censuses`

---

### `regions`

**Purpose**: Hierarchical geographic/administrative divisions within jurisdictions

| Column               | Type    | Description                                     |
| -------------------- | ------- | ----------------------------------------------- |
| `id`                 | SERIAL  | Primary key                                     |
| `name`               | TEXT    | Display name (e.g., "Calgary", "Ontario")       |
| `code`               | TEXT    | Short code (e.g., "CGY", "ON", "CA-FED")        |
| `type`               | TEXT    | "General", "Region", "Subnational", "Subregion" |
| `jurisdiction_id`    | INTEGER | References `jurisdictions.id`                   |
| `parent_region_id`   | INTEGER | Self-reference for hierarchy                    |
| `parent_region_code` | TEXT    | Parent's code (denormalized)                    |
| `order_index`        | INTEGER | Display ordering                                |

**Regional Hierarchy Example** (Canadian Federal):

```
CA-FED (General - Federal)
├── BC (Region/Subnational)
│   ├── RBC (Rest of BC - Subregion)
│   ├── MV (Metro Vancouver - Subregion)
│   └── GVC (Greater Victoria - Subregion)
├── AB (Region/Subnational)
│   ├── CGY (Calgary - Subregion)
│   ├── EDM (Edmonton - Subregion)
│   └── NRA (Northern Rural Alberta - Subregion)
└── ON (Region/Subnational)
    ├── TOR (Toronto - Subregion)
    └── OTT (Ottawa - Subregion)
```

**Type Definitions**:

- **General**: Top-level aggregate for entire jurisdiction
- **Region**: Major geographic division (can also be Subnational)
- **Subnational**: Province/State-level division
- **Subregion**: Fine-grained areas (cities, metropolitan regions, rural areas)

**Relationships**:

- Belongs to one `jurisdiction`
- Self-referential hierarchy (parent/child regions)
- Has many `constituencies` (via region_id, subnational_id, subregion_id)

---

### `parties`

**Purpose**: Political parties within jurisdictions

| Column            | Type    | Description                          |
| ----------------- | ------- | ------------------------------------ |
| `id`              | SERIAL  | Primary key                          |
| `name`            | TEXT    | Full party name                      |
| `acronym`         | TEXT    | Display acronym (e.g., "LPC", "CPC") |
| `simple_acronym`  | TEXT    | Simplified version for aggregation   |
| `jurisdiction_id` | INTEGER | References `jurisdictions.id`        |
| `primary_color`   | TEXT    | Hex color code                       |
| `gradient_colors` | JSONB   | Array of gradient colors             |
| `founded`         | DATE    | Founding date                        |
| `dissolved`       | DATE    | Dissolution date (if applicable)     |
| `metadata`        | JSONB   | `{leader, ideology, website, logo}`  |

**Relationships**:

- Belongs to one `jurisdiction`
- Referenced in `poll_results`, `election_results.party_results` (via code)

---

### `constituencies`

**Purpose**: Electoral districts/ridings where votes are cast

| Column            | Type    | Description                            |
| ----------------- | ------- | -------------------------------------- |
| `id`              | SERIAL  | Primary key                            |
| `name`            | TEXT    | Full constituency name                 |
| `code`            | TEXT    | Short code/number                      |
| `jurisdiction_id` | INTEGER | References `jurisdictions.id`          |
| `region`          | TEXT    | Region code (denormalized)             |
| `subnational`     | TEXT    | Subnational code (denormalized)        |
| `subregion`       | TEXT    | Subregion code (denormalized)          |
| `region_id`       | INTEGER | References `regions.id`                |
| `subnational_id`  | INTEGER | References `regions.id`                |
| `subregion_id`    | INTEGER | References `regions.id`                |
| `order_index`     | INTEGER | Display ordering                       |
| `metadata`        | JSONB   | `{population, registeredVoters, area}` |

**Key Notes**:

- **Triple region referencing**: Each constituency can belong to a region, subnational, and subregion simultaneously
- **Denormalized codes**: Text codes stored for quick filtering without joins
- **Normalized IDs**: Foreign keys to `regions` table for relational integrity

**Relationships**:

- Belongs to one `jurisdiction`
- References up to 3 `regions` (region, subnational, subregion)
- Has many `election_results`

---

## Electoral Data

### `elections`

**Purpose**: Individual election events

| Column              | Type         | Description                                  |
| ------------------- | ------------ | -------------------------------------------- |
| `id`                | SERIAL       | Primary key                                  |
| `code`              | TEXT         | Election code (e.g., "2019-FED")             |
| `jurisdiction_id`   | INTEGER      | References `jurisdictions.id`                |
| `electoral_system`  | ENUM         | Electoral system used                        |
| `name`              | TEXT         | Display name (e.g., "2019 Federal Election") |
| `start_date`        | DATE         | Election date                                |
| `end_date`          | DATE         | Same or later (for multi-day elections)      |
| `type`              | TEXT         | "General", "By-election", "Primary"          |
| `turnout`           | NUMERIC(5,2) | Overall turnout percentage                   |
| `registered_voters` | INTEGER      | Total registered voters                      |
| `total_votes`       | INTEGER      | Total votes cast                             |
| `total_valid_votes` | INTEGER      | Valid votes (excluding spoiled)              |
| `sources`           | JSONB        | `{electionSource, voteSource}`               |

**CRITICAL Date Handling**:

⚠️ **NO `year` COLUMN EXISTS** - Year must be extracted from `start_date`:

```python
# WRONG - will cause KeyError
year = election["year"]  ❌

# CORRECT - extract from date field
year = election["start_date"].year  ✅

# Best practice - add to dict for repeated access
for election in elections:
    election["year"] = election["start_date"].year
```

**When to Extract Year**:

1. **In query loaders** (`queries/electoral.py`) - Add `EXTRACT(YEAR FROM start_date) as year` to SELECT
2. **After loading data** - Add year field immediately: `election["year"] = election["start_date"].year`
3. **Never assume** it exists in raw database records

**Relationships**:

- Belongs to one `jurisdiction`
- Has many `election_results`, `election_results_regions`

---

### `election_results`

**Purpose**: Constituency-level election results (individual riding outcomes)

| Column             | Type         | Description                                             |
| ------------------ | ------------ | ------------------------------------------------------- |
| `id`               | SERIAL       | Primary key                                             |
| `election_id`      | INTEGER      | References `elections.id`                               |
| `constituency_id`  | INTEGER      | References `constituencies.id`                          |
| `rep_order`        | INTEGER      | Representation order (1 for current, 2+ for historical) |
| `total_votes`      | INTEGER      | Total votes in constituency                             |
| `eligible_voters`  | INTEGER      | Eligible voters in constituency                         |
| `rejected_ballots` | INTEGER      | Spoiled/rejected ballots                                |
| `turnout`          | NUMERIC(5,2) | Constituency turnout percentage                         |
| `party_results`    | JSONB        | Array of party performance (see below)                  |
| `metadata`         | JSONB        | `{advanceVotes, recountRequested, notes}`               |

**`party_results` JSONB Structure**:

```json
[
  {
    "partyCode": "LPC",
    "partyName": "Liberal Party",
    "candidateName": "John Smith",
    "votes": 25432,
    "percentage": 0.48234, // ⚠️ STORED AS DECIMAL (0-1), NOT PERCENTAGE (0-100)
    "isWinner": true,
    "isIncumbent": false
  },
  {
    "partyCode": "CPC",
    "partyName": "Conservative Party",
    "candidateName": "Jane Doe",
    "votes": 18923,
    "percentage": 0.35876, // ⚠️ STORED AS DECIMAL (0-1), NOT PERCENTAGE (0-100)
    "isWinner": false,
    "isIncumbent": true
  }
]
```

**CRITICAL Percentage Handling**:

⚠️ **Percentages stored as DECIMALS (0-1 range), NOT percentages (0-100)**:

```python
# WRONG - will give wrong values
percentage = party_result["percentage"]  # 0.48234 (not 48.234%)

# CORRECT - multiply by 100 when extracting
percentage = party_result["percentage"] * 100  # 48.234% ✅

# Loading election results for riding baseline
riding["previous_percentages"][party_code] = party_result["percentage"] * 100
```

**When to Convert**:

1. **Always multiply by 100** when reading from `party_results` JSONB
2. **Store as is** when writing to database (divide by 100 first)
3. **Model calculations** expect percentages (0-100 range)

**Relationships**:

- Belongs to one `election`
- Belongs to one `constituency`

---

### `election_results_regions`

**Purpose**: Aggregated election results by geographic regions

| Column            | Type    | Description                                          |
| ----------------- | ------- | ---------------------------------------------------- |
| `id`              | SERIAL  | Primary key                                          |
| `election_id`     | INTEGER | References `elections.id`                            |
| `jurisdiction_id` | INTEGER | References `jurisdictions.id`                        |
| `region`          | TEXT    | Region code (denormalized, nullable)                 |
| `subnational`     | TEXT    | Subnational code (denormalized, nullable)            |
| `subregion`       | TEXT    | Subregion code (denormalized, nullable)              |
| `year`            | INTEGER | **Election year** (from election date, NOT rep_year) |
| `region_id`       | INTEGER | References `regions.id`                              |
| `party_results`   | JSONB   | Aggregated party results (see below)                 |
| `total_votes`     | INTEGER | Sum of all votes in region                           |
| `total_seats`     | INTEGER | Total seats won in region                            |
| `constituencies`  | INTEGER | Number of constituencies aggregated                  |
| `metadata`        | JSONB   | `{aggregationLevel, sourceConstituencies, notes}`    |

**Aggregation Levels** (in `metadata.aggregationLevel`):

- **`general`**: Entire jurisdiction aggregate (all constituencies)
  - Example: All 343 federal constituencies → 1 record with `region_id` pointing to "CA-FED"
- **`regional`**: Top-level region aggregate (e.g., "BC", "AB", "PR")
  - Populated when `region` field is set
- **`subnational`**: Province/state-level aggregate (e.g., "ON", "QC")
  - Populated when `subnational` field is set
- **`subregional`**: Fine-grained area (e.g., "CGY", "TOR", "MV")
  - Populated when `subregion` field is set

**`party_results` JSONB Structure**:

```json
[
  {
    "partyCode": "LPC",
    "partyName": "Liberal Party",
    "votes": 6024761,
    "percentage": 0.331635,
    "seats": 153
  },
  {
    "partyCode": "CPC",
    "partyName": "Conservative Party",
    "votes": 6239377,
    "percentage": 0.343448,
    "seats": 130
  }
]
```

**Key Notes**:

- **Year comes from election date**, NOT from `rep_year` in constituency metadata
- **Hierarchical aggregation**: Same data appears at multiple levels (general, regional, subnational, subregional)
- **Nullable region fields**: General aggregations have all region fields NULL, only `region_id` points to General region

**Relationships**:

- Belongs to one `election`
- Belongs to one `jurisdiction`
- Optionally references one `region` (via `region_id`)

---

## Polling Data

### `pollsters`

**Purpose**: Polling organizations

| Column            | Type         | Description                                                                             |
| ----------------- | ------------ | --------------------------------------------------------------------------------------- |
| `id`              | INTEGER      | Primary key                                                                             |
| `name`            | TEXT         | Pollster name (unique)                                                                  |
| `website`         | TEXT         | Website URL                                                                             |
| `jurisdiction_id` | INTEGER      | References `jurisdictions.id`                                                           |
| `rating`          | NUMERIC(5,2) | Quality rating (0-5)                                                                    |
| `accuracy`        | NUMERIC(5,2) | Historical accuracy score                                                               |
| `last_updated`    | DATE         | Last poll date                                                                          |
| `metadata`        | JSONB        | `{notes, methodology, biasDirection, averageError, trackRecord, founded, headquarters}` |

**Relationships**:

- Belongs to one `jurisdiction`
- Has many `polls`, `poll_results`

---

### `polls`

**Purpose**: Individual polling surveys

| Column            | Type         | Description                        |
| ----------------- | ------------ | ---------------------------------- |
| `id`              | SERIAL       | Primary key                        |
| `serial_id`       | INTEGER      | Sequential ID within pollster      |
| `pollster_id`     | INTEGER      | References `pollsters.id`          |
| `jurisdiction_id` | INTEGER      | References `jurisdictions.id`      |
| `start_date`      | DATE         | Poll start date                    |
| `end_date`        | DATE         | Poll end date                      |
| `sample_size`     | INTEGER      | Number of respondents              |
| `margin_of_error` | NUMERIC(3,1) | MOE percentage                     |
| `methodology`     | TEXT         | Polling method (IVR, Online, etc.) |
| `source`          | TEXT         | Data source URL                    |
| `is_rolling`      | BOOLEAN      | Is this a rolling average?         |
| `rolling_period`  | TEXT         | Rolling period description         |
| `metadata`        | JSONB        | `{notes, originalId}`              |

**Relationships**:

- Belongs to one `pollster`
- Belongs to one `jurisdiction`
- Has many `poll_results`

---

### `poll_questions`

**Purpose**: Standardized poll questions with demographic/regional filtering

| Column               | Type    | Description                         |
| -------------------- | ------- | ----------------------------------- |
| `id`                 | INTEGER | Primary key                         |
| `section`            | TEXT    | Question category                   |
| `subsection`         | TEXT    | Question subcategory                |
| `question`           | TEXT    | Full question text                  |
| `title`              | TEXT    | Display title                       |
| `demographic_filter` | TEXT    | "All", "Age 18-34", "Women", etc.   |
| `region_filter`      | TEXT    | "All", "ON", "BC", "Atlantic", etc. |
| `order_index`        | INTEGER | Display ordering                    |
| `metadata`           | JSONB   | `{filterCombination, description}`  |

**Relationships**:

- Has many `poll_results`

---

### `poll_results`

**Purpose**: Individual poll response data points

| Column          | Type         | Description                    |
| --------------- | ------------ | ------------------------------ |
| `id`            | SERIAL       | Primary key                    |
| `serial_id`     | INTEGER      | Sequential ID within pollster  |
| `date`          | DATE         | Poll date                      |
| `question`      | TEXT         | Question asked                 |
| `voters`        | TEXT         | Voter type (LV, RV, All)       |
| `option_key`    | TEXT         | Response option code           |
| `percentage`    | JSONB        | Response percentage            |
| `demo_filter`   | TEXT         | Demographic filter applied     |
| `region_filter` | TEXT         | Regional filter applied        |
| `sample_size`   | INTEGER      | Subsample size                 |
| `sum`           | NUMERIC(5,2) | Checksum of percentages        |
| `question_id`   | INTEGER      | References `poll_questions.id` |
| `option_id`     | INTEGER      | References `poll_options.id`   |
| `pollster_id`   | INTEGER      | References `pollsters.id`      |
| `metadata`      | JSONB        | `{originalValue, notes}`       |

**Relationships**:

- Belongs to one `pollster`
- Optionally references `poll_question`, `poll_option`

---

### `poll_options`

**Purpose**: Standardized response options for polls

| Column         | Type    | Description                      |
| -------------- | ------- | -------------------------------- |
| `id`           | INTEGER | Primary key                      |
| `section`      | TEXT    | Option category                  |
| `option_key`   | TEXT    | Option code (e.g., "LPC", "CPC") |
| `display_name` | TEXT    | Display name                     |
| `color_hex`    | TEXT    | Display color                    |
| `metadata`     | JSONB   | `{aliases, category}`            |

**Relationships**:

- Has many `poll_results`

---

## Projection Data

### `projections_election`

**Purpose**: Master projection models (Monte Carlo simulations)

| Column            | Type      | Description                                      |
| ----------------- | --------- | ------------------------------------------------ |
| `id`              | SERIAL    | Primary key                                      |
| `jurisdiction_id` | INTEGER   | References `jurisdictions.id`                    |
| `name`            | TEXT      | Projection name/title                            |
| `methodology`     | TEXT      | Model methodology description                    |
| `created_at`      | TIMESTAMP | Creation timestamp                               |
| `metadata`        | JSONB     | `{pollCount, lastPollDate, baselineYear, notes}` |

**Relationships**:

- Belongs to one `jurisdiction`
- Has many `projections_general`, `projections_regional`, `projections_constituency`, `projection_accuracy`

---

### `projections_general`

**Purpose**: Jurisdiction-wide projection aggregates

| Column                   | Type         | Description                                  |
| ------------------------ | ------------ | -------------------------------------------- |
| `id`                     | SERIAL       | Primary key                                  |
| `projection_id`          | INTEGER      | References `projections_election.id`         |
| `party`                  | TEXT         | Party code                                   |
| `seats`                  | INTEGER      | Projected seat count (median)                |
| `vote_percentage`        | NUMERIC(5,2) | Projected vote share                         |
| `seat_min`               | INTEGER      | Minimum seats (5th percentile)               |
| `seat_max`               | INTEGER      | Maximum seats (95th percentile)              |
| `government_probability` | NUMERIC(5,2) | Probability of forming government            |
| `seat_histogram`         | JSONB        | Seat distribution `{seatCount: probability}` |

**Relationships**:

- Belongs to one `projection_election`

---

### `projections_regional`

**Purpose**: Regional projection breakdowns

| Column            | Type         | Description                          |
| ----------------- | ------------ | ------------------------------------ |
| `id`              | SERIAL       | Primary key                          |
| `projection_id`   | INTEGER      | References `projections_election.id` |
| `region_id`       | INTEGER      | References `regions.id`              |
| `region_name`     | TEXT         | Region name (denormalized)           |
| `party`           | TEXT         | Party code                           |
| `seats`           | INTEGER      | Projected seats in region            |
| `vote_percentage` | NUMERIC(5,2) | Projected vote share in region       |
| `seat_min`        | INTEGER      | Minimum seats (5th percentile)       |
| `seat_max`        | INTEGER      | Maximum seats (95th percentile)      |
| `seat_histogram`  | JSONB        | Seat distribution                    |

**Relationships**:

- Belongs to one `projection_election`
- References one `region`

---

### `projections_constituency`

**Purpose**: Individual constituency projections (the most detailed level)

| Column                  | Type         | Description                          |
| ----------------------- | ------------ | ------------------------------------ |
| `id`                    | SERIAL       | Primary key                          |
| `projection_id`         | INTEGER      | References `projections_election.id` |
| `constituency_id`       | INTEGER      | References `constituencies.id`       |
| `constituency_name`     | TEXT         | Constituency name (denormalized)     |
| `region_id`             | INTEGER      | References `regions.id`              |
| `subnational_id`        | INTEGER      | References `regions.id`              |
| `subregion_id`          | INTEGER      | References `regions.id`              |
| `region_code`           | TEXT         | Region code (denormalized)           |
| `subnational_code`      | TEXT         | Subnational code (denormalized)      |
| `subregion_code`        | TEXT         | Subregion code (denormalized)        |
| `total_votes`           | INTEGER      | Projected total votes                |
| `effective_sample_size` | INTEGER      | Effective polling sample             |
| `projected_winner`      | TEXT         | Projected winning party              |
| `previous_winner`       | TEXT         | Previous election winner             |
| `margin`                | NUMERIC(5,2) | Victory margin                       |
| `party`                 | TEXT         | Party code                           |
| `votes`                 | INTEGER      | Projected votes for party            |
| `vote_percentage`       | NUMERIC(5,2) | Projected vote share                 |
| `margin_of_error`       | NUMERIC(5,2) | Uncertainty estimate                 |
| `win_probability`       | NUMERIC(5,2) | Probability of winning               |

**Key Notes**:

- **Wide table design**: Each row contains both constituency info AND individual party projections
- **Multiple rows per constituency**: One row per party projection
- **Triple region referencing**: Same pattern as `constituencies` table

**Relationships**:

- Belongs to one `projection_election`
- References one `constituency`
- References up to 3 `regions`

---

### `projections_accuracy`

**Purpose**: Post-election accuracy evaluation of projections

| Column                  | Type         | Description                                          |
| ----------------------- | ------------ | ---------------------------------------------------- |
| `id`                    | SERIAL       | Primary key                                          |
| `projection_id`         | INTEGER      | References `projections_election.id`                 |
| `election_id`           | INTEGER      | References `elections.id`                            |
| `evaluated_at`          | TIMESTAMP    | Evaluation timestamp                                 |
| `overall_accuracy`      | NUMERIC(5,2) | Overall accuracy score                               |
| `seat_error`            | NUMERIC(5,2) | Seat count error                                     |
| `vote_error`            | NUMERIC(5,2) | Vote share error                                     |
| `constituency_hit_rate` | NUMERIC(5,2) | % of correct constituency calls                      |
| `party_accuracy`        | JSONB        | Per-party accuracy `{party: {seatError, voteError}}` |
| `regional_accuracy`     | JSONB        | Per-region accuracy                                  |
| `metadata`              | JSONB        | `{notes, methodology}`                               |

**Relationships**:

- Belongs to one `projection_election`
- References one `election` (actual results)

---

## Demographics Data

### `censuses`

**Purpose**: Census metadata and collection information

| Column                | Type         | Description                    |
| --------------------- | ------------ | ------------------------------ |
| `id`                  | SERIAL       | Primary key                    |
| `jurisdiction_id`     | INTEGER      | References `jurisdictions.id`  |
| `year`                | INTEGER      | Census year                    |
| `name`                | TEXT         | Census name/title              |
| `collection_date`     | DATE         | Data collection date           |
| `release_date`        | DATE         | Public release date            |
| `population`          | INTEGER      | Total population counted       |
| `coverage_percentage` | NUMERIC(5,2) | Coverage rate                  |
| `metadata`            | JSONB        | `{methodology, source, notes}` |

**Relationships**:

- Belongs to one `jurisdiction`
- Has many `demographics_geographic`, `demographic_stats`

---

### `demographic_categories`

**Purpose**: Standardized demographic categories and subcategories from census data

| Column               | Type    | Description                                   |
| -------------------- | ------- | --------------------------------------------- |
| `id`                 | SERIAL  | Primary key                                   |
| `census_id`          | INTEGER | References `censuses.id`                      |
| `category`           | TEXT    | Main category (e.g., "Total - Age groups...") |
| `subcategory`        | TEXT    | Subcategory (e.g., "0 to 14 years")           |
| `subsubcategory`     | TEXT    | Sub-subcategory (e.g., "0 to 4 years")        |
| `characteristics_id` | INTEGER | Statistics Canada characteristics ID          |
| `is_province`        | BOOLEAN | Whether this applies to province-level data   |
| `description`        | TEXT    | Full description                              |
| `metadata`           | JSONB   | Additional category information               |

**Key Notes**:

- **Hierarchical structure**: Categories can have multiple levels (category → subcategory → subsubcategory)
- **Statistics Canada mapping**: Links to official census characteristics via `characteristics_id`
- **Flexible scope**: Can apply to different geographic levels

**Relationships**:

- Belongs to one `census`
- Referenced by `demographics_geographic`, `demographic_stats`, `demographic_importance`

---

### `demographics_geographic`

**Purpose**: Actual demographic data values by geographic area (constituency or other geographic units)

| Column            | Type    | Description                                                              |
| ----------------- | ------- | ------------------------------------------------------------------------ |
| `id`              | SERIAL  | Primary key                                                              |
| `constituency_id` | INTEGER | References `constituencies.id` (nullable)                                |
| `census_id`       | INTEGER | References `censuses.id`                                                 |
| `category_id`     | INTEGER | References `demographic_categories.id`                                   |
| `geographics_id`  | INTEGER | Statistics Canada geographic identifier                                  |
| `is_constituency` | BOOLEAN | TRUE for constituency-level data, FALSE for provincial/national/regional |
| `values`          | JSONB   | Demographic values (see structure below)                                 |
| `metadata`        | JSONB   | Geographic and source metadata                                           |

**`values` JSONB Structure**:

```json
{
  "total": 45234,
  "men": 22156,
  "women": 23078,
  "rateTotal": 15.8,
  "rateMen": 15.2,
  "rateWomen": 16.4,
  "breakdown": {
    "0-4": 2234,
    "5-9": 2156,
    "10-14": 2344
  }
}
```

**`metadata` JSONB Structure**:

```json
{
  "source": "demographics",
  "notes": "2021 Census data",
  "confidence": "high",
  "sgcCode": 10001,
  "geoName": "Avalon"
}
```

**Key Notes**:

- **Flexible geography**: Can store data for constituencies or other geographic units
- **Statistics Canada integration**: Uses `geographics_id` and `sgcCode` for official geographic codes
- **Multi-value support**: Can store absolute numbers, rates, and breakdowns in single record
- **Constituency flag**: `is_constituency = TRUE` for riding-level data, `FALSE` for provincial/national/regional aggregates
- **Nullable constituency_id**: `constituency_id` is NULL when `is_constituency = FALSE` (broader geographic data)

**Relationships**:

- Optionally belongs to one `constituency` (when `is_constituency = TRUE` for constituency-level data)
- Belongs to one `census`
- References one `demographic_category`

---

### `demographic_stats`

**Purpose**: Statistical summaries of demographic data across constituencies within jurisdictions

| Column            | Type    | Description                            |
| ----------------- | ------- | -------------------------------------- |
| `id`              | SERIAL  | Primary key                            |
| `category_id`     | INTEGER | References `demographic_categories.id` |
| `census_id`       | INTEGER | References `censuses.id`               |
| `jurisdiction_id` | INTEGER | References `jurisdictions.id`          |
| `stats`           | JSONB   | Statistical summary (see below)        |

**`stats` JSONB Structure**:

```json
{
  "mean": 16.258,
  "median": 15.8,
  "stdDev": 3.335,
  "min": 8.2,
  "max": 28.4,
  "percentiles": {
    "25": 13.5,
    "75": 18.9,
    "90": 22.1,
    "95": 24.8
  },
  "constituencyCount": 399
}
```

**Key Notes**:

- **Jurisdiction-level aggregation**: Provides statistical summary across all constituencies in a jurisdiction
- **Comprehensive statistics**: Mean, median, standard deviation, min/max, and percentiles
- **Sample size tracking**: `constituencyCount` shows how many constituencies contributed to the statistics
- **Cross-census comparison**: Can compare statistical patterns across different census years

**Relationships**:

- References one `demographic_category`
- Belongs to one `census`
- Belongs to one `jurisdiction`

---

### `demographic_importance`

**Purpose**: Classification of demographic categories by electoral/political importance

| Column          | Type    | Description                                                             |
| --------------- | ------- | ----------------------------------------------------------------------- |
| `id`            | SERIAL  | Primary key                                                             |
| `category_id`   | INTEGER | References `demographic_categories.id`                                  |
| `type`          | TEXT    | Classification type ("Rate", "Title", "Median", "Average", "Special")   |
| `importance`    | TEXT    | Importance level ("High", "Medium", "Low", "Inapplicable")              |
| `demo_category` | TEXT    | Broad demographic group ("Age", "Income", "Education", "Housing", etc.) |

**Importance Classifications**:

- **High**: Demographics with strong electoral predictive power (e.g., age groups, income levels, education)
- **Medium**: Moderately important for electoral analysis (e.g., housing types, immigration status)
- **Low**: Less directly relevant but useful for context (e.g., specific income brackets, detailed ethnic breakdowns)
- **Inapplicable**: Title/header categories that don't contain actual data values

**Type Classifications**:

- **Rate**: Percentage-based demographics (most common)
- **Title**: Category headers/containers (marked as "Inapplicable")
- **Median**: Median values (e.g., median age, median income)
- **Average**: Mean/average values (e.g., average household size)
- **Special**: Unique metrics that don't fit other categories

**Demo Category Groups**:

- **Age**: Age-related demographics
- **Income**: Income and employment data
- **Education**: Educational attainment
- **Housing**: Housing types and conditions
- **Ethnicity**: Ethnic and racial demographics
- **Indigenous**: Indigenous population data
- **Immigration**: Immigration and citizenship status
- **Language**: Language spoken at home
- **Religion**: Religious affiliation
- **Household**: Family and household composition

**Relationships**:

- References one `demographic_category`

---

## Relationships Diagram

```
countries
    └── jurisdictions
            ├── regions (hierarchical self-reference)
            │       └── [referenced by constituencies, projections_regional]
            ├── constituencies
            │       └── election_results
            ├── elections
            │       ├── election_results
            │       └── election_results_regions
            ├── parties
            ├── polls
            │       └── poll_results
            ├── pollsters
            │       └── polls
            ├── censuses
            │       └── demographics_geographic
            └── projections_election
                    ├── projections_general
                    ├── projections_regional
                    ├── projections_constituency
                    └── projections_accuracy
```

---

## Key Design Patterns

### 1. **Multi-Jurisdiction Support with Country Context**

**Problem**: Same jurisdiction codes (e.g., "FED") exist for multiple countries.

**Solution**: Always use `(country_code, jurisdiction_code)` tuples for matching:

```python
jurisdiction_lookup[("CA", "FED")] = 1   # Canadian Federal
jurisdiction_lookup[("US", "FED")] = 31  # US Federal
```

---

### 2. **Triple Region Referencing**

**Pattern**: Constituencies and projections reference three levels of regions:

- `region_id` / `region` → Top-level region (e.g., "BC", "AB")
- `subnational_id` / `subnational` → Province/State (e.g., "ON", "QC")
- `subregion_id` / `subregion` → Fine-grained area (e.g., "TOR", "CGY")

**Why**:

- Enables filtering at multiple geographic granularities
- Supports hierarchical aggregation
- Allows flexible querying without complex joins

---

### 3. **Denormalization for Performance**

**Pattern**: Store both normalized IDs AND denormalized codes:

```sql
region_id INTEGER REFERENCES regions(id),
region TEXT  -- denormalized code
```

**Benefits**:

- Fast filtering without joins (`WHERE region = 'ON'`)
- Referential integrity via foreign keys
- Backward compatibility with existing code

---

### 4. **Hierarchical Regional Aggregations**

**Pattern**: Same election data aggregated at 4 levels in `election_results_regions`:

1. **General**: Entire jurisdiction (region_id → General region)
2. **Regional**: Major regions (e.g., "BC", "PR")
3. **Subnational**: Provinces/States (e.g., "ON", "SK")
4. **Subregional**: Cities/areas (e.g., "CGY", "TOR")

**Metadata tracking**:

```json
{
  "aggregationLevel": "subregional",
  "sourceConstituencies": [1234, 1235, 1236],
  "notes": "Aggregated from 11 constituencies"
}
```

---

### 5. **JSONB for Flexible Nested Data**

**Use Cases**:

- **Party results**: Array of party performance in elections
- **Poll responses**: Complex polling data structures
- **Seat histograms**: Probability distributions from Monte Carlo
- **Metadata**: Extensible additional information

**Example** (`election_results.party_results`):

```json
[
  {
    "partyCode": "LPC",
    "votes": 25432,
    "percentage": 0.48234,
    "isWinner": true,
    "candidateName": "John Smith"
  }
]
```

---

### 6. **Temporal Data Handling**

**Year vs Date**:

- `elections.start_date` → Full date (2019-10-21)
- `election_results_regions.year` → **Election year only** (extracted from start_date)
- `constituencies.metadata.rep_year` → **Redistricting year** (different from election year!)

**Rep Order** (`election_results.rep_order`):

- `1` = Current representation boundaries
- `2+` = Historical boundaries (after redistricting)

---

### 7. **Cascading Deletes and Updates**

**Pattern**: Use `ON DELETE CASCADE` for dependent data:

```sql
country_id INTEGER REFERENCES countries(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
```

**Use `SET NULL` for optional references**:

```sql
region_id INTEGER REFERENCES regions(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
```

---

### 8. **Data Quality Handling**

**Null String Cleaning**: Convert literal "Null" strings to actual NULL:

```python
def clean_region_value(value):
    if value and value.strip().lower() == "null":
        return None
    return value
```

**Required in**:

- `election_results` metadata parsing
- `constituencies` region field processing
- Any user-input data

---

## Common Query Patterns

### Get all constituencies in a region

```sql
SELECT * FROM constituencies
WHERE region_id = 2  -- BC
  AND jurisdiction_id = 1;  -- Federal
```

### Get regional election results for 2019

```sql
SELECT * FROM election_results_regions
WHERE election_id = 43
  AND metadata->>'aggregationLevel' = 'regional';
```

### Get projection with confidence intervals

```sql
SELECT
    party,
    seats,
    seat_min,
    seat_max,
    government_probability
FROM projections_general
WHERE projection_id = 1
ORDER BY seats DESC;
```

### Get poll aggregation with demographic filter

```sql
SELECT * FROM poll_results
WHERE question_id = 1
  AND demo_filter = 'All'
  AND region_filter = 'ON'
  AND date >= '2024-01-01';
```

---

## Migration and Upload Order

**Dependency Chain** (must be followed for data uploads):

1. `countries` (no dependencies)
2. `jurisdictions` (depends on countries)
3. `parties` (depends on jurisdictions)
4. `regions` (depends on jurisdictions)
5. `censuses` (depends on jurisdictions)
6. `elections` (depends on jurisdictions)
7. `constituencies` (depends on jurisdictions, regions, elections)
8. `election_results` (depends on elections, constituencies, parties)
9. `election_results_regions` (depends on election_results, regions, constituencies)
10. `projections_accuracy` (depends on elections)

**Master Upload Script**: `neon/new_upload_scripts/upload.py`

---

## Notes and Best Practices

1. **Always use country context** when matching jurisdictions
2. **Extract year from election date**, not from constituency rep_year
3. **Clean "Null" strings** from metadata before processing
4. **Use region_id for General aggregations** in election_results_regions
5. **Maintain triple region referencing** in constituencies and projections
6. **Store both codes and IDs** for regional data (denormalization + normalization)
7. **Use aggregation_level in metadata** to distinguish between general/regional/subnational/subregional
8. **Follow dependency order** when uploading or migrating data

---

**End of Database Documentation**

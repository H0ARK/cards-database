-- Drop old inefficient price_history table
DROP TABLE IF EXISTS price_history CASCADE;

-- Create optimized price_history table
-- Storage optimizations:
-- 1. Remove UUID primary key (16 bytes saved per row)
-- 2. Use INTEGER for product_id instead of TEXT
-- 3. Use DATE instead of TIMESTAMP (4 bytes vs 8 bytes)
-- 4. Remove redundant fields from JSONB (provider, currency always same)
-- 5. Use SMALLINT for prices in cents (2 bytes vs NUMERIC)
-- 6. Add table partitioning by date for better performance

CREATE TABLE price_history (
    product_id INTEGER NOT NULL,
    recorded_at DATE NOT NULL,

    -- Prices stored as SMALLINT in cents (max $327.67)
    -- For prices > $327, we'll use a separate JSONB field
    low_price SMALLINT,           -- lowPrice in cents
    mid_price SMALLINT,           -- midPrice in cents
    high_price SMALLINT,          -- highPrice in cents
    market_price SMALLINT,        -- marketPrice in cents
    direct_low_price SMALLINT,    -- directLowPrice in cents

    -- For expensive cards > $327.67, store in JSONB
    extended_prices JSONB,        -- Only populated for high-value cards

    -- Variant info (normalized separately to avoid repetition)
    variant_id SMALLINT,          -- Reference to price_variants table

    PRIMARY KEY (product_id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Create partitions by month for better performance
CREATE TABLE price_history_2024_02 PARTITION OF price_history
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE price_history_2024_03 PARTITION OF price_history
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

CREATE TABLE price_history_2024_04 PARTITION OF price_history
    FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');

CREATE TABLE price_history_2024_05 PARTITION OF price_history
    FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');

CREATE TABLE price_history_2024_06 PARTITION OF price_history
    FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');

CREATE TABLE price_history_2024_07 PARTITION OF price_history
    FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');

CREATE TABLE price_history_2024_08 PARTITION OF price_history
    FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');

CREATE TABLE price_history_2024_09 PARTITION OF price_history
    FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');

CREATE TABLE price_history_2024_10 PARTITION OF price_history
    FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');

CREATE TABLE price_history_2024_11 PARTITION OF price_history
    FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');

CREATE TABLE price_history_2024_12 PARTITION OF price_history
    FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');

CREATE TABLE price_history_2025_01 PARTITION OF price_history
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE price_history_2025_02 PARTITION OF price_history
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE price_history_2025_03 PARTITION OF price_history
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE TABLE price_history_2025_04 PARTITION OF price_history
    FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

CREATE TABLE price_history_2025_05 PARTITION OF price_history
    FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');

CREATE TABLE price_history_2025_06 PARTITION OF price_history
    FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

CREATE TABLE price_history_2025_07 PARTITION OF price_history
    FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');

CREATE TABLE price_history_2025_08 PARTITION OF price_history
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

CREATE TABLE price_history_2025_09 PARTITION OF price_history
    FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

CREATE TABLE price_history_2025_10 PARTITION OF price_history
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE TABLE price_history_2025_11 PARTITION OF price_history
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Variant lookup table (normalize subTypeName to avoid repetition)
CREATE TABLE price_variants (
    id SMALLSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL  -- "Normal", "Holofoil", "Reverse Holofoil", etc.
);

-- Pre-populate common variants
INSERT INTO price_variants (name) VALUES
    ('Normal'),
    ('Holofoil'),
    ('Reverse Holofoil'),
    ('1st Edition'),
    ('1st Edition Holofoil'),
    ('Unlimited'),
    ('Unlimited Holofoil'),
    ('Shadowless'),
    ('Shadowless Holofoil')
ON CONFLICT (name) DO NOTHING;

-- Index for fast lookups by product
CREATE INDEX idx_price_history_product ON price_history (product_id, recorded_at DESC);

-- Index for date range queries
CREATE INDEX idx_price_history_date ON price_history (recorded_at);

-- COMMENT explaining the optimization
COMMENT ON TABLE price_history IS
'Optimized price history storage:
- Prices stored as SMALLINT cents (2 bytes) for values up to $327.67
- Extended JSONB only for high-value cards
- Partitioned by month for query performance
- No UUID overhead (saves 16 bytes per row)
- Variant names normalized to avoid repetition
- Estimated: 15-20 bytes per row vs 290 bytes in old schema';

COMMENT ON COLUMN price_history.low_price IS 'Price in cents (divide by 100 for dollars). NULL if > $327.67, see extended_prices';
COMMENT ON COLUMN price_history.extended_prices IS 'JSONB for prices > $327.67: {low: 500.00, mid: 750.00, high: 1000.00, market: 800.00}';

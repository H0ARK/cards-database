-- ============================================================================
-- TCGPlayer Reference Tables - Fully Normalized Schema
-- ============================================================================
-- This schema mirrors TCGPlayer's structure but properly normalized
-- - No JSONB abuse (only for actual card text that varies)
-- - Proper foreign keys and indexes
-- - Supports all card games (Magic, Pokemon, YuGiOh, etc.)
-- - Synthetic IDs (1B+) for non-TCGPlayer cards (Chinese, Korean, etc.)
-- ============================================================================

-- ============================================================================
-- LOOKUP TABLES (Normalize repeated values)
-- ============================================================================

-- Card rarities (Common, Rare, Holo Rare, Secret Rare, etc.)
CREATE TABLE IF NOT EXISTS rarities (
    id SMALLSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    display_order INTEGER DEFAULT 0
);

CREATE INDEX idx_rarities_name ON rarities(name);

-- Pre-populate common rarities
INSERT INTO rarities (name, display_order) VALUES
    ('Common', 1),
    ('Uncommon', 2),
    ('Rare', 3),
    ('Holo Rare', 4),
    ('Reverse Holofoil', 5),
    ('Ultra Rare', 6),
    ('Secret Rare', 7),
    ('Rare Holo', 8),
    ('Rare Holo EX', 9),
    ('Rare Holo GX', 10),
    ('Rare Holo V', 11),
    ('Rare Holo VMAX', 12),
    ('Promo', 13)
ON CONFLICT (name) DO NOTHING;

-- Card types (for Pokemon: Psychic, Fire, Water, etc.; for Magic: Creature, Instant, etc.)
CREATE TABLE IF NOT EXISTS card_types (
    id SMALLSERIAL PRIMARY KEY,
    category_id INTEGER,  -- Different types per game
    name TEXT NOT NULL,
    display_name TEXT,
    UNIQUE(category_id, name)
);

CREATE INDEX idx_card_types_category ON card_types(category_id);
CREATE INDEX idx_card_types_name ON card_types(name);

-- Pre-populate Pokemon types
INSERT INTO card_types (category_id, name, display_name) VALUES
    (3, 'Colorless', 'Colorless'),
    (3, 'Darkness', 'Darkness'),
    (3, 'Dragon', 'Dragon'),
    (3, 'Fairy', 'Fairy'),
    (3, 'Fighting', 'Fighting'),
    (3, 'Fire', 'Fire'),
    (3, 'Grass', 'Grass'),
    (3, 'Lightning', 'Lightning'),
    (3, 'Metal', 'Metal'),
    (3, 'Psychic', 'Psychic'),
    (3, 'Water', 'Water'),
    (3, 'Trainer', 'Trainer'),
    (3, 'Energy', 'Energy')
ON CONFLICT DO NOTHING;

-- Product variants (Normal, Holofoil, Reverse Holofoil, 1st Edition, etc.)
CREATE TABLE IF NOT EXISTS variants (
    id SMALLSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE INDEX idx_variants_name ON variants(name);

-- Pre-populate common variants
INSERT INTO variants (name) VALUES
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

-- ============================================================================
-- CORE TABLES (TCGPlayer Structure)
-- ============================================================================

-- Categories (Card Games: Magic, Pokemon, YuGiOh, etc.)
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT,
    popularity INTEGER DEFAULT 0,
    is_scannable BOOLEAN DEFAULT false,
    is_direct BOOLEAN DEFAULT false,
    modified_on TIMESTAMP
);

CREATE INDEX idx_categories_name ON categories(name);
CREATE INDEX idx_categories_popularity ON categories(popularity DESC);

COMMENT ON TABLE categories IS 'Card game categories (Magic, Pokemon, YuGiOh, etc.). IDs 1-999 are TCGPlayer, 1000+ are synthetic.';

-- Groups (Sets: Base Set, Jungle, Fossil, etc.)
CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    abbreviation TEXT,
    is_supplemental BOOLEAN DEFAULT false,
    published_on DATE,
    modified_on TIMESTAMP
);

CREATE INDEX idx_groups_category ON groups(category_id);
CREATE INDEX idx_groups_name ON groups(name);
CREATE INDEX idx_groups_abbreviation ON groups(abbreviation);
CREATE INDEX idx_groups_published ON groups(published_on DESC);

COMMENT ON TABLE groups IS 'Card sets/expansions. IDs 1-999999999 are TCGPlayer, 1000000000+ are synthetic.';

-- Products (Individual Cards)
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,

    -- Basic Info
    name TEXT NOT NULL,
    clean_name TEXT,
    card_number TEXT,

    -- Card Properties (normalized)
    rarity_id SMALLINT REFERENCES rarities(id),
    card_type_id SMALLINT REFERENCES card_types(id),

    -- Pokemon/Game-specific fields (NULL for non-applicable games)
    hp SMALLINT,
    stage TEXT,  -- "Basic", "Stage 1", "Stage 2", "VMAX", etc.
    retreat_cost SMALLINT,

    -- Images (construct URL from product_id)
    -- Format: https://tcgplayer-cdn.tcgplayer.com/product/{id}_{size}.jpg
    -- Sizes: 200w, 400w, 600w
    image_count SMALLINT DEFAULT 0,

    -- Presale info
    is_presale BOOLEAN DEFAULT false,
    released_on DATE,

    -- Metadata
    url TEXT,
    modified_on TIMESTAMP,

    -- Card text ONLY (the actual ability/attack text that varies wildly)
    -- This is the ONLY acceptable use of JSONB
    card_text JSONB,

    -- Source tracking
    is_synthetic BOOLEAN DEFAULT false  -- TRUE for IDs >= 1000000000
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_group ON products(group_id);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_clean_name ON products(clean_name);
CREATE INDEX idx_products_card_number ON products(card_number);
CREATE INDEX idx_products_rarity ON products(rarity_id);
CREATE INDEX idx_products_type ON products(card_type_id);
CREATE INDEX idx_products_synthetic ON products(is_synthetic);

-- GIN index for card text search (only when needed)
CREATE INDEX idx_products_card_text ON products USING GIN (card_text);

COMMENT ON TABLE products IS 'All products (cards). IDs 1-999999999 are TCGPlayer originals, 1000000000+ are synthetic for non-TCGPlayer cards (Chinese, Korean, etc.)';
COMMENT ON COLUMN products.card_text IS 'JSONB for card abilities, attacks, and flavor text. Only use for actual text content that varies per card.';
COMMENT ON COLUMN products.is_synthetic IS 'TRUE if product_id >= 1000000000 (non-TCGPlayer card from TCGdex, etc.)';

-- ============================================================================
-- PRICE HISTORY (Time-Series Data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS price_history (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id SMALLINT REFERENCES variants(id),
    recorded_at DATE NOT NULL,

    -- Prices in cents (SMALLINT = max $327.67)
    low_price SMALLINT,
    mid_price SMALLINT,
    high_price SMALLINT,
    market_price SMALLINT,
    direct_low_price SMALLINT,

    -- For expensive cards > $327.67 (rare, store as dollars)
    low_price_usd NUMERIC(10,2),
    mid_price_usd NUMERIC(10,2),
    high_price_usd NUMERIC(10,2),
    market_price_usd NUMERIC(10,2),

    PRIMARY KEY (product_id, variant_id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Create monthly partitions (better query performance)
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

CREATE INDEX idx_price_history_product ON price_history(product_id, recorded_at DESC);
CREATE INDEX idx_price_history_date ON price_history(recorded_at DESC);

COMMENT ON TABLE price_history IS 'Time-series price data. Partitioned by month for performance. Prices under $327.67 use SMALLINT cents, higher use NUMERIC dollars.';

-- ============================================================================
-- TRANSLATIONS (Multi-language support from TCGdex)
-- ============================================================================

-- Product name translations (for international cards)
CREATE TABLE IF NOT EXISTS product_translations (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    language_code TEXT NOT NULL,  -- 'en', 'fr', 'ja', 'zh-Hans', 'ko', etc.
    name TEXT NOT NULL,
    card_text JSONB,  -- Translated card text
    PRIMARY KEY (product_id, language_code)
);

CREATE INDEX idx_product_translations_lang ON product_translations(language_code);
CREATE INDEX idx_product_translations_name ON product_translations(name);

COMMENT ON TABLE product_translations IS 'Multi-language names and card text. Supplements TCGPlayer data with translations from TCGdex.';

-- ============================================================================
-- VIEWS (Convenience queries)
-- ============================================================================

-- Current prices (latest date for each product)
CREATE OR REPLACE VIEW current_prices AS
SELECT DISTINCT ON (product_id, variant_id)
    product_id,
    variant_id,
    recorded_at,
    low_price,
    mid_price,
    high_price,
    market_price,
    direct_low_price,
    low_price_usd,
    mid_price_usd,
    high_price_usd,
    market_price_usd
FROM price_history
ORDER BY product_id, variant_id, recorded_at DESC;

COMMENT ON VIEW current_prices IS 'Latest prices for each product/variant combination';

-- Products with current prices (most common query)
CREATE OR REPLACE VIEW products_with_prices AS
SELECT
    p.*,
    cp.variant_id,
    cp.recorded_at as price_date,
    cp.market_price,
    cp.market_price_usd,
    cp.low_price,
    cp.high_price
FROM products p
LEFT JOIN current_prices cp ON p.id = cp.product_id;

COMMENT ON VIEW products_with_prices IS 'Products joined with their current market prices. Use this for product listings with prices.';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to generate image URL
CREATE OR REPLACE FUNCTION get_product_image_url(product_id INTEGER, size TEXT DEFAULT '400w')
RETURNS TEXT AS $$
BEGIN
    RETURN 'https://tcgplayer-cdn.tcgplayer.com/product/' || product_id || '_' || size || '.jpg';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION get_product_image_url IS 'Generate TCGPlayer CDN image URL. Sizes: 200w, 400w, 600w';

-- ============================================================================
-- SUMMARY
-- ============================================================================
--
-- ID Ranges:
-- - Categories:  1-999 (TCGPlayer), 1000+ (synthetic)
-- - Groups:      1-999999999 (TCGPlayer), 1000000000+ (synthetic)
-- - Products:    1-999999999 (TCGPlayer), 1000000000+ (synthetic)
--
-- No JSONB abuse:
-- - Rarities: Normalized table
-- - Card types: Normalized table
-- - Variants: Normalized table
-- - Only card_text uses JSONB (legitimate use case)
--
-- Image URLs: Construct from product_id
-- - get_product_image_url(42346, '400w') → full URL
--
-- ============================================================================

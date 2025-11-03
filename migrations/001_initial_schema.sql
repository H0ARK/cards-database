-- Initial Schema for Multi-Game Card Database
-- Supports: Pokemon, Magic: The Gathering, Yu-Gi-Oh, and future card games
-- Version: 1.0.0

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for text search

-- ============================================================================
-- CORE GAME STRUCTURE
-- ============================================================================

-- Card games (Pokemon, Magic, Yu-Gi-Oh, etc.)
CREATE TABLE games (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Series (e.g., "Scarlet & Violet", "Sword & Shield" for Pokemon)
CREATE TABLE series (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    name JSONB NOT NULL, -- {"en": "Scarlet & Violet", "fr": "Écarlate & Violet"}
    slug TEXT NOT NULL,
    logo TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(game_id, slug)
);

-- Sets (e.g., "Base Set", "Prismatic Evolutions")
CREATE TABLE sets (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    series_id TEXT REFERENCES series(id) ON DELETE SET NULL,
    name JSONB NOT NULL, -- {"en": "Base Set", "fr": "Set de Base"}
    slug TEXT NOT NULL,
    card_count JSONB DEFAULT '{}', -- {"total": 102, "official": 102, "secret": 0}
    release_date TEXT,
    legal JSONB DEFAULT '{}', -- {"standard": true, "expanded": true}
    logo TEXT,
    symbol TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(game_id, slug)
);

-- ============================================================================
-- CARDS
-- ============================================================================

CREATE TABLE cards (
    id TEXT PRIMARY KEY, -- Global ID: "base1-1", "mtg-island-001"
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    set_id TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
    local_id TEXT NOT NULL, -- Local ID within set: "001", "102"
    name JSONB NOT NULL, -- {"en": "Pikachu", "ja": "ピカチュウ"}

    -- Common card attributes (game-agnostic)
    illustrator TEXT,
    rarity TEXT,
    category TEXT, -- "Pokemon", "Trainer", "Energy", "Creature", "Instant", etc.

    -- Game-specific data (flexible JSONB)
    attributes JSONB DEFAULT '{}', -- HP, types, attacks, abilities, mana cost, etc.

    -- Images
    image TEXT,
    image_small TEXT,
    image_high TEXT,

    -- Legal/Regulation
    legal JSONB DEFAULT '{}',
    regulation_mark TEXT,

    -- Third-party integrations
    third_party JSONB DEFAULT '{}', -- {tcgplayer: {...}, cardmarket: {...}}

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(set_id, local_id)
);

-- Indexes for common queries
CREATE INDEX idx_cards_game ON cards(game_id);
CREATE INDEX idx_cards_set ON cards(set_id);
CREATE INDEX idx_cards_local_id ON cards(set_id, local_id);
CREATE INDEX idx_cards_rarity ON cards(rarity);
CREATE INDEX idx_cards_category ON cards(category);
CREATE INDEX idx_cards_name_gin ON cards USING gin(name jsonb_path_ops);
CREATE INDEX idx_cards_attributes_gin ON cards USING gin(attributes jsonb_path_ops);
CREATE INDEX idx_cards_third_party_gin ON cards USING gin(third_party jsonb_path_ops);

-- Full-text search on card names (all languages)
CREATE INDEX idx_cards_name_search ON cards USING gin(
    (name->>'en' || ' ' ||
     COALESCE(name->>'fr', '') || ' ' ||
     COALESCE(name->>'es', '') || ' ' ||
     COALESCE(name->>'ja', '')) gin_trgm_ops
);

-- ============================================================================
-- CARD VARIANTS
-- ============================================================================

-- Card variants (Reverse Holo, Master Ball Pattern, Foil, etc.)
CREATE TABLE card_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    variant_type TEXT NOT NULL, -- "normal", "reverse", "holo", "masterball", "pokeball"
    name JSONB, -- Optional variant-specific name
    image TEXT,
    image_small TEXT,
    image_high TEXT,
    third_party JSONB DEFAULT '{}', -- Variant-specific TCGPlayer/Cardmarket IDs
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(card_id, variant_type)
);

CREATE INDEX idx_variants_card ON card_variants(card_id);
CREATE INDEX idx_variants_type ON card_variants(variant_type);

-- ============================================================================
-- SEALED PRODUCTS
-- ============================================================================

CREATE TABLE sealed_products (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    set_id TEXT REFERENCES sets(id) ON DELETE CASCADE,
    name JSONB NOT NULL,
    product_type TEXT NOT NULL, -- "booster-box", "etb", "tin", "bundle"

    -- Product details
    pack_count INTEGER,
    cards_per_pack INTEGER,
    exclusive BOOLEAN DEFAULT false,
    exclusive_retailer TEXT,

    -- Images
    image TEXT,

    -- Third-party integrations
    third_party JSONB DEFAULT '{}',

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sealed_game ON sealed_products(game_id);
CREATE INDEX idx_sealed_set ON sealed_products(set_id);
CREATE INDEX idx_sealed_type ON sealed_products(product_type);

-- ============================================================================
-- PRICING DATA
-- ============================================================================

-- Current prices (latest snapshot)
CREATE TABLE prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id TEXT REFERENCES cards(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES card_variants(id) ON DELETE CASCADE,
    sealed_product_id TEXT REFERENCES sealed_products(id) ON DELETE CASCADE,

    provider TEXT NOT NULL, -- "tcgplayer", "cardmarket", "ebay"
    product_id TEXT, -- Provider's product ID

    -- Price data (JSONB for flexibility across providers)
    price_data JSONB NOT NULL, -- {low: 1.99, mid: 2.50, high: 3.99, market: 2.75, currency: "USD"}

    updated_at TIMESTAMP DEFAULT NOW(),

    -- Ensure only one of card_id, variant_id, or sealed_product_id is set
    CHECK (
        (card_id IS NOT NULL AND variant_id IS NULL AND sealed_product_id IS NULL) OR
        (card_id IS NULL AND variant_id IS NOT NULL AND sealed_product_id IS NULL) OR
        (card_id IS NULL AND variant_id IS NULL AND sealed_product_id IS NOT NULL)
    ),

    UNIQUE(provider, card_id, variant_id, sealed_product_id)
);

CREATE INDEX idx_prices_card ON prices(card_id);
CREATE INDEX idx_prices_variant ON prices(variant_id);
CREATE INDEX idx_prices_sealed ON prices(sealed_product_id);
CREATE INDEX idx_prices_provider ON prices(provider);
CREATE INDEX idx_prices_updated ON prices(updated_at);

-- Price history (time-series data)
CREATE TABLE price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id TEXT REFERENCES cards(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES card_variants(id) ON DELETE CASCADE,
    sealed_product_id TEXT REFERENCES sealed_products(id) ON DELETE CASCADE,

    provider TEXT NOT NULL,
    product_id TEXT,

    -- Historical price point
    price_data JSONB NOT NULL,
    recorded_at TIMESTAMP NOT NULL,

    CHECK (
        (card_id IS NOT NULL AND variant_id IS NULL AND sealed_product_id IS NULL) OR
        (card_id IS NULL AND variant_id IS NOT NULL AND sealed_product_id IS NULL) OR
        (card_id IS NULL AND variant_id IS NULL AND sealed_product_id IS NOT NULL)
    )
);

CREATE INDEX idx_price_history_card ON price_history(card_id, recorded_at DESC);
CREATE INDEX idx_price_history_variant ON price_history(variant_id, recorded_at DESC);
CREATE INDEX idx_price_history_sealed ON price_history(sealed_product_id, recorded_at DESC);
CREATE INDEX idx_price_history_provider ON price_history(provider, recorded_at DESC);

-- Hypertable for time-series optimization (if using TimescaleDB)
-- SELECT create_hypertable('price_history', 'recorded_at', if_not_exists => TRUE);

-- ============================================================================
-- LOOKUPS & ENUMERATIONS
-- ============================================================================

-- Card attributes lookup (types, stages, rarities, etc.)
CREATE TABLE attributes (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- "type", "rarity", "stage", "trainer-type", etc.
    name JSONB NOT NULL, -- {"en": "Fire", "fr": "Feu"}
    slug TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    UNIQUE(game_id, category, slug)
);

CREATE INDEX idx_attributes_game ON attributes(game_id);
CREATE INDEX idx_attributes_category ON attributes(game_id, category);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_series_updated_at BEFORE UPDATE ON series
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sets_updated_at BEFORE UPDATE ON sets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_card_variants_updated_at BEFORE UPDATE ON card_variants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sealed_products_updated_at BEFORE UPDATE ON sealed_products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert Pokemon game
INSERT INTO games (id, name, slug, metadata) VALUES
    ('pokemon', 'Pokémon Trading Card Game', 'pokemon', '{"abbreviation": "PTCG"}');

-- You can add other games here:
-- INSERT INTO games (id, name, slug) VALUES
--     ('magic', 'Magic: The Gathering', 'magic'),
--     ('yugioh', 'Yu-Gi-Oh!', 'yugioh');

-- ============================================================================
-- VIEWS FOR CONVENIENCE
-- ============================================================================

-- Complete card view with set and series information
CREATE VIEW cards_complete AS
SELECT
    c.*,
    s.name AS set_name,
    s.slug AS set_slug,
    s.logo AS set_logo,
    s.symbol AS set_symbol,
    sr.name AS series_name,
    sr.slug AS series_slug,
    g.name AS game_name,
    g.slug AS game_slug
FROM cards c
LEFT JOIN sets s ON c.set_id = s.id
LEFT JOIN series sr ON s.series_id = sr.id
LEFT JOIN games g ON c.game_id = g.id;

-- Card with current prices
CREATE VIEW cards_with_prices AS
SELECT
    c.*,
    COALESCE(
        jsonb_object_agg(
            p.provider,
            p.price_data
        ) FILTER (WHERE p.provider IS NOT NULL),
        '{}'::jsonb
    ) AS current_prices
FROM cards c
LEFT JOIN prices p ON c.id = p.card_id
GROUP BY c.id;

COMMENT ON TABLE games IS 'Card games (Pokemon, Magic, Yu-Gi-Oh, etc.)';
COMMENT ON TABLE series IS 'Series within a game (e.g., Scarlet & Violet)';
COMMENT ON TABLE sets IS 'Card sets/expansions';
COMMENT ON TABLE cards IS 'Individual cards (language-agnostic with JSONB for translations)';
COMMENT ON TABLE card_variants IS 'Card variants (holos, reverse holos, special patterns)';
COMMENT ON TABLE sealed_products IS 'Sealed products (booster boxes, ETBs, etc.)';
COMMENT ON TABLE prices IS 'Current/latest prices from various providers';
COMMENT ON TABLE price_history IS 'Historical price data for trend analysis';
COMMENT ON TABLE attributes IS 'Lookup tables for card attributes (types, rarities, etc.)';

-- Performance Optimization Migration
-- Adds indexes to dramatically improve search and filter query performance
-- Version: 2.0.0

-- ============================================================================
-- DROP INEFFICIENT INDEXES
-- ============================================================================

-- Drop the old full-text search index that's not being used effectively
DROP INDEX IF EXISTS idx_cards_name_search;

-- ============================================================================
-- OPTIMIZED TEXT SEARCH INDEXES
-- ============================================================================

-- Add trigram indexes for ILIKE searches on text fields
-- These enable fast pattern matching with ILIKE '%term%' queries

-- Illustrator search (commonly filtered)
CREATE INDEX IF NOT EXISTS idx_cards_illustrator_trgm ON cards USING gin(illustrator gin_trgm_ops);

-- Rarity search (commonly filtered)
CREATE INDEX IF NOT EXISTS idx_cards_rarity_trgm ON cards USING gin(rarity gin_trgm_ops);

-- Category search (commonly filtered)
CREATE INDEX IF NOT EXISTS idx_cards_category_trgm ON cards USING gin(category gin_trgm_ops);

-- Regulation mark search
CREATE INDEX IF NOT EXISTS idx_cards_regulation_mark_trgm ON cards USING gin(regulation_mark gin_trgm_ops);

-- ============================================================================
-- JSONB PATH INDEXES FOR CARD NAMES (ALL LANGUAGES)
-- ============================================================================

-- Individual language name searches - these are much faster than the combined index
CREATE INDEX IF NOT EXISTS idx_cards_name_en_trgm ON cards USING gin((name->>'en') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_name_fr_trgm ON cards USING gin((name->>'fr') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_name_es_trgm ON cards USING gin((name->>'es') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_name_de_trgm ON cards USING gin((name->>'de') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_name_it_trgm ON cards USING gin((name->>'it') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_name_pt_trgm ON cards USING gin((name->>'pt') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_name_ja_trgm ON cards USING gin((name->>'ja') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_name_ko_trgm ON cards USING gin((name->>'ko') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_name_zh_trgm ON cards USING gin((name->>'zh') gin_trgm_ops);

-- ============================================================================
-- JSONB PATH INDEXES FOR CARD ATTRIBUTES
-- ============================================================================

-- Stage search (Pokemon evolution stage)
CREATE INDEX IF NOT EXISTS idx_cards_stage_trgm ON cards USING gin((attributes->>'stage') gin_trgm_ops);

-- HP search (exact match is more common)
CREATE INDEX IF NOT EXISTS idx_cards_hp ON cards ((attributes->>'hp'));

-- Types array search (using jsonb_path_ops for containment queries)
CREATE INDEX IF NOT EXISTS idx_cards_types ON cards USING gin((attributes->'types') jsonb_path_ops);

-- EvolveFrom searches (all languages)
CREATE INDEX IF NOT EXISTS idx_cards_evolvefrom_en_trgm ON cards USING gin((attributes->'evolveFrom'->>'en') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_evolvefrom_fr_trgm ON cards USING gin((attributes->'evolveFrom'->>'fr') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_evolvefrom_es_trgm ON cards USING gin((attributes->'evolveFrom'->>'es') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_evolvefrom_de_trgm ON cards USING gin((attributes->'evolveFrom'->>'de') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_evolvefrom_ja_trgm ON cards USING gin((attributes->'evolveFrom'->>'ja') gin_trgm_ops);

-- Description searches (most common languages only to save space)
CREATE INDEX IF NOT EXISTS idx_cards_description_en_trgm ON cards USING gin((attributes->'description'->>'en') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_description_fr_trgm ON cards USING gin((attributes->'description'->>'fr') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_description_es_trgm ON cards USING gin((attributes->'description'->>'es') gin_trgm_ops);

-- Trainer type (for Trainer cards)
CREATE INDEX IF NOT EXISTS idx_cards_trainer_type_trgm ON cards USING gin((attributes->>'trainerType') gin_trgm_ops);

-- Energy type (for Energy cards)
CREATE INDEX IF NOT EXISTS idx_cards_energy_type_trgm ON cards USING gin((attributes->>'energyType') gin_trgm_ops);

-- Effect searches (for Trainer/Energy cards)
CREATE INDEX IF NOT EXISTS idx_cards_effect_en_trgm ON cards USING gin((attributes->'effect'->>'en') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_cards_effect_fr_trgm ON cards USING gin((attributes->'effect'->>'fr') gin_trgm_ops);

-- DexId array for Pokedex number searches
CREATE INDEX IF NOT EXISTS idx_cards_dexid ON cards USING gin((attributes->'dexId') jsonb_path_ops);

-- ============================================================================
-- COMPOSITE INDEXES FOR COMMON FILTER COMBINATIONS
-- ============================================================================

-- Set + Rarity (common filter combination)
CREATE INDEX IF NOT EXISTS idx_cards_set_rarity ON cards(set_id, rarity);

-- Set + Category (common filter combination)
CREATE INDEX IF NOT EXISTS idx_cards_set_category ON cards(set_id, category);

-- Game + Set + Local ID (for exact card lookups)
CREATE INDEX IF NOT EXISTS idx_cards_game_set_local ON cards(game_id, set_id, local_id);

-- Category + Rarity (common for filtered listings)
CREATE INDEX IF NOT EXISTS idx_cards_category_rarity ON cards(category, rarity);

-- ============================================================================
-- SET NAME INDEXES FOR JOIN OPTIMIZATION
-- ============================================================================

-- Set name searches (all languages)
CREATE INDEX IF NOT EXISTS idx_sets_name_en_trgm ON sets USING gin((name->>'en') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sets_name_fr_trgm ON sets USING gin((name->>'fr') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sets_name_es_trgm ON sets USING gin((name->>'es') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sets_name_de_trgm ON sets USING gin((name->>'de') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sets_name_it_trgm ON sets USING gin((name->>'it') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sets_name_pt_trgm ON sets USING gin((name->>'pt') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sets_name_ja_trgm ON sets USING gin((name->>'ja') gin_trgm_ops);

-- Set ID search
CREATE INDEX IF NOT EXISTS idx_sets_id_trgm ON sets USING gin(id gin_trgm_ops);

-- Set slug for exact lookups
CREATE INDEX IF NOT EXISTS idx_sets_slug ON sets(slug);

-- ============================================================================
-- SERIES NAME INDEXES
-- ============================================================================

-- Series name searches (all languages)
CREATE INDEX IF NOT EXISTS idx_series_name_en_trgm ON series USING gin((name->>'en') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_series_name_fr_trgm ON series USING gin((name->>'fr') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_series_name_es_trgm ON series USING gin((name->>'es') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_series_name_de_trgm ON series USING gin((name->>'de') gin_trgm_ops);

-- Series ID search
CREATE INDEX IF NOT EXISTS idx_series_id_trgm ON series USING gin(id gin_trgm_ops);

-- Series slug for exact lookups
CREATE INDEX IF NOT EXISTS idx_series_slug ON series(slug);

-- ============================================================================
-- SEALED PRODUCTS INDEXES
-- ============================================================================

-- Sealed product name searches
CREATE INDEX IF NOT EXISTS idx_sealed_name_en_trgm ON sealed_products USING gin((name->>'en') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sealed_name_fr_trgm ON sealed_products USING gin((name->>'fr') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sealed_name_es_trgm ON sealed_products USING gin((name->>'es') gin_trgm_ops);

-- Product type search
CREATE INDEX IF NOT EXISTS idx_sealed_type_trgm ON sealed_products USING gin(product_type gin_trgm_ops);

-- Exclusive retailer search
CREATE INDEX IF NOT EXISTS idx_sealed_retailer_trgm ON sealed_products USING gin(exclusive_retailer gin_trgm_ops);

-- Sealed product ID search
CREATE INDEX IF NOT EXISTS idx_sealed_id_trgm ON sealed_products USING gin(id gin_trgm_ops);

-- ============================================================================
-- PARTIAL INDEXES FOR SPECIFIC CATEGORIES
-- ============================================================================

-- Index for Pokemon cards only (if most queries are for Pokemon)
CREATE INDEX IF NOT EXISTS idx_cards_pokemon_name_en ON cards USING gin((name->>'en') gin_trgm_ops)
WHERE category = 'Pokemon';

-- Index for Trainer cards
CREATE INDEX IF NOT EXISTS idx_cards_trainer_name_en ON cards USING gin((name->>'en') gin_trgm_ops)
WHERE category = 'Trainer';

-- Index for Energy cards
CREATE INDEX IF NOT EXISTS idx_cards_energy_name_en ON cards USING gin((name->>'en') gin_trgm_ops)
WHERE category = 'Energy';

-- ============================================================================
-- STATISTICS UPDATE
-- ============================================================================

-- Update statistics for better query planning
ANALYZE cards;
ANALYZE sets;
ANALYZE series;
ANALYZE sealed_products;
ANALYZE card_variants;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX idx_cards_illustrator_trgm IS 'Trigram index for fast illustrator ILIKE searches';
COMMENT ON INDEX idx_cards_name_en_trgm IS 'Trigram index for English name ILIKE searches';
COMMENT ON INDEX idx_cards_stage_trgm IS 'Trigram index for Pokemon stage searches';
COMMENT ON INDEX idx_cards_set_rarity IS 'Composite index for set+rarity filter combinations';
COMMENT ON INDEX idx_cards_game_set_local IS 'Composite index for exact card lookups';

-- ============================================================================
-- VACUUM
-- ============================================================================

-- Note: VACUUM must be run separately outside of transaction block
-- Run these commands manually after migration:
-- VACUUM ANALYZE cards;
-- VACUUM ANALYZE sets;
-- VACUUM ANALYZE series;
-- VACUUM ANALYZE sealed_products;

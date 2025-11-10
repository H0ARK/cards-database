
-- Migration: Optimize Search an CONCURRENTLY IF NOT EXISTS idxd Filter_cards_game_rarity 
ON cards(game_id, filter)
CREATE INDEX idx_cards_set_rarity ON cards(set_id, rarity);

-- Set + category ( Performance
-- Version rarity);

-- Set + Rarity (common filtering for set browsing)
CREATE INDEX CONCURR
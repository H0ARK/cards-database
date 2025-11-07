-- Migration: Add PriceCharting Scraping Data Tables
-- Version: 2.0.0
-- Description: Add tables to store scraped PriceCharting data including eBay sales and graded card information

-- ============================================================================
-- PRICECHARTING SCRAPING DATA
-- ============================================================================

-- Store scraped PriceCharting data for cards
CREATE TABLE pricecharting_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id TEXT REFERENCES cards(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES card_variants(id) ON DELETE CASCADE,

    -- PriceCharting specific identifiers
    pc_code TEXT NOT NULL, -- PriceCharting's unique code for the card
    pc_url TEXT, -- Full PriceCharting URL

    -- Scraped data
    scraped_data JSONB NOT NULL, -- Raw scraped data from PriceCharting
    last_scraped TIMESTAMP DEFAULT NOW(),

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Ensure only one of card_id or variant_id is set
    CHECK (
        (card_id IS NOT NULL AND variant_id IS NULL) OR
        (card_id IS NULL AND variant_id IS NOT NULL)
    ),

    UNIQUE(pc_code)
);

-- Store individual eBay sales data from PriceCharting
CREATE TABLE pricecharting_ebay_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pc_data_id UUID NOT NULL REFERENCES pricecharting_data(id) ON DELETE CASCADE,

    -- eBay sale details
    ebay_code TEXT NOT NULL, -- Unique code for this eBay sale
    ebay_url TEXT, -- Direct eBay listing URL
    title TEXT, -- eBay listing title
    condition TEXT, -- Card condition (Near Mint, Lightly Played, etc.)
    grade TEXT, -- PSA/BGS grade if applicable
    grading_company TEXT, -- PSA, BGS, etc.

    -- Pricing
    price DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    shipping DECIMAL(8,2), -- Shipping cost if available

    -- Sale details
    sold_date TIMESTAMP,
    seller TEXT,
    location TEXT,

    -- Metadata
    scraped_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(ebay_code)
);

-- Store graded card market data
CREATE TABLE pricecharting_graded_market (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pc_data_id UUID NOT NULL REFERENCES pricecharting_data(id) ON DELETE CASCADE,

    -- Grading details
    grade TEXT NOT NULL, -- PSA 10, BGS 9.5, etc.
    grading_company TEXT NOT NULL, -- PSA, BGS, CGC, etc.

    -- Market data
    market_price DECIMAL(10,2),
    low_price DECIMAL(10,2),
    high_price DECIMAL(10,2),
    sales_count INTEGER DEFAULT 0,

    -- Last updated
    last_updated TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(pc_data_id, grade, grading_company)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_pricecharting_data_card ON pricecharting_data(card_id);
CREATE INDEX idx_pricecharting_data_variant ON pricecharting_data(variant_id);
CREATE INDEX idx_pricecharting_data_pc_code ON pricecharting_data(pc_code);
CREATE INDEX idx_pricecharting_data_last_scraped ON pricecharting_data(last_scraped);

CREATE INDEX idx_ebay_sales_pc_data ON pricecharting_ebay_sales(pc_data_id);
CREATE INDEX idx_ebay_sales_ebay_code ON pricecharting_ebay_sales(ebay_code);
CREATE INDEX idx_ebay_sales_condition ON pricecharting_ebay_sales(condition);
CREATE INDEX idx_ebay_sales_grade ON pricecharting_ebay_sales(grade);
CREATE INDEX idx_ebay_sales_sold_date ON pricecharting_ebay_sales(sold_date DESC);
CREATE INDEX idx_ebay_sales_price ON pricecharting_ebay_sales(price);

CREATE INDEX idx_graded_market_pc_data ON pricecharting_graded_market(pc_data_id);
CREATE INDEX idx_graded_market_grade ON pricecharting_graded_market(grade, grading_company);
CREATE INDEX idx_graded_market_last_updated ON pricecharting_graded_market(last_updated);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_pricecharting_data_updated_at
    BEFORE UPDATE ON pricecharting_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for complete PriceCharting data with card information
CREATE VIEW pricecharting_complete AS
SELECT
    pcd.*,
    c.name AS card_name,
    c.set_id,
    s.name AS set_name,
    cv.variant_type,
    -- Count of eBay sales
    (SELECT COUNT(*) FROM pricecharting_ebay_sales pes WHERE pes.pc_data_id = pcd.id) AS ebay_sales_count,
    -- Count of graded market entries
    (SELECT COUNT(*) FROM pricecharting_graded_market pgm WHERE pgm.pc_data_id = pcd.id) AS graded_entries_count
FROM pricecharting_data pcd
LEFT JOIN cards c ON pcd.card_id = c.id
LEFT JOIN sets s ON c.set_id = s.id
LEFT JOIN card_variants cv ON pcd.variant_id = cv.id;

-- View for recent eBay sales with card details
CREATE VIEW ebay_sales_recent AS
SELECT
    pes.*,
    pcd.pc_code,
    pcd.pc_url,
    c.name AS card_name,
    c.id AS card_id,
    s.name AS set_name,
    cv.variant_type
FROM pricecharting_ebay_sales pes
JOIN pricecharting_data pcd ON pes.pc_data_id = pcd.id
LEFT JOIN cards c ON pcd.card_id = c.id
LEFT JOIN card_variants cv ON pcd.variant_id = cv.id
LEFT JOIN sets s ON c.set_id = s.id
ORDER BY pes.sold_date DESC;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE pricecharting_data IS 'Core PriceCharting data for cards, scraped from their website';
COMMENT ON TABLE pricecharting_ebay_sales IS 'Individual eBay sales data extracted from PriceCharting';
COMMENT ON TABLE pricecharting_graded_market IS 'Graded card market data from PriceCharting';
COMMENT ON VIEW pricecharting_complete IS 'Complete view of PriceCharting data with card details';
COMMENT ON VIEW ebay_sales_recent IS 'Recent eBay sales with full card information';

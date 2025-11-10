# eBay Trading Card Scraper

A production-ready Scrapy spider for scraping eBay trading card listings with anti-detection measures and comprehensive data processing.

## Features

- **Multi-region support**: Scrapes eBay US, UK, Canada, and Australia
- **Anti-detection measures**: Rotating user agents, realistic headers, rate limiting
- **Data validation**: Automatic cleaning and validation of scraped data
- **Deduplication**: Removes duplicate listings
- **Statistics generation**: Automatic price analysis and insights
- **Production-ready**: Conservative rate limiting, error handling, retries

## Setup

1. **Activate virtual environment**:
   ```bash
   cd scrapers
   source venv/bin/activate
   ```

2. **Navigate to project**:
   ```bash
   cd ebay_scraper
   ```

## Usage

### Basic Search
```bash
# Search for Pokemon cards, 3 pages max
scrapy crawl ebay_cards -a search_query="pokemon cards" -a max_pages=3
```

### Custom Search
```bash
# Search for specific cards
scrapy crawl ebay_cards -a search_query="charizard 1st edition" -a max_pages=5

# Search for YuGiOh cards
scrapy crawl ebay_cards -a search_query="yugioh blue eyes white dragon" -a max_pages=2
```

### Advanced Options
```bash
# With custom output directory
scrapy crawl ebay_cards -a search_query="magic the gathering" -a max_pages=10 -s output_dir="mtg_data"
```

## Output

The scraper generates several files in the `output/` directory:

- **`ebay_listings_[timestamp].json`**: Raw scraped data with metadata
- **`summary_[timestamp].json`**: Statistical analysis including:
  - Price statistics (mean, median, min, max)
  - Condition breakdown
  - Price analysis by condition
  - Total items scraped

## Configuration

### Rate Limiting
- 3-second delays between requests (with jitter)
- 1 concurrent request maximum
- AutoThrottle extension enabled
- Respects robots.txt

### Anti-Detection
- Rotating user agents (8 different browsers)
- Realistic HTTP headers
- Random viewport simulation
- Domain-specific rate limiting

## Data Structure

Each scraped item contains:
```json
{
  "ebay_id": "123456789012",
  "title": "Pokemon Charizard 1st Edition",
  "price": 150.00,
  "price_text": "$150.00",
  "condition": "Near Mint",
  "date": "2024-01-15",
  "url": "https://www.ebay.com/itm/...",
  "image_url": "https://i.ebayimg.com/...",
  "seller": "TopSeller123",
  "location": "United States",
  "shipping_cost": 0.0,
  "bids_count": 0,
  "time_left": null,
  "scraped_at": "2024-01-15T10:30:00.000Z"
}
```

## Troubleshooting

### Common Issues

1. **No items found**: eBay may have changed their HTML structure. Check the spider's CSS selectors.

2. **Rate limiting**: If getting 429 errors, increase delays in settings.py:
   ```python
   DOWNLOAD_DELAY = 5  # Increase from 3
   MIN_DELAY = 3.0      # Increase from 2.0
   MAX_DELAY = 12.0     # Increase from 8.0
   ```

3. **CAPTCHA blocks**: The scraper detects CAPTCHAs but can't solve them. If blocked:
   - Wait longer between sessions
   - Use different IP (VPN/proxy)
   - Reduce scraping frequency

### Debugging
```bash
# Enable debug logging
scrapy crawl ebay_cards -a search_query="test" -L DEBUG

# Save to CSV for inspection
# Uncomment the FEEDS section in settings.py
```

## Architecture

- **Spider**: `ebay_cards.py` - Handles search URL generation and pagination
- **Middleware**: `AntiDetectionDownloaderMiddleware` - Anti-detection measures
- **Pipelines**:
  - `ValidationPipeline` - Data cleaning
  - `DeduplicationPipeline` - Remove duplicates
  - `DataAggregationPipeline` - Statistics generation
  - `JsonExportPipeline` - Data export

## Extending

### Adding New Fields
1. Update `EbayListingItem` in `items.py`
2. Modify extraction logic in `ebay_cards.py`
3. Update validation in `ValidationPipeline`

### Adding New Sites
1. Create new spider in `spiders/` directory
2. Configure appropriate settings
3. Test thoroughly with small datasets

## Legal & Ethical

⚠️ **Important Notice**: eBay's robots.txt explicitly disallows automated search scraping (`Disallow: /*_kw`). This scraper is configured to ignore robots.txt for personal research use, but you should:

- Use conservative rate limiting (3+ second delays)
- Only scrape for personal/research purposes
- Respect eBay's Terms of Service
- Consider using official eBay APIs for commercial use
- Be aware that excessive scraping may result in IP blocks

The scraper uses ethical practices:
- Realistic user agents and headers
- Conservative rate limiting (3+ seconds between requests)
- Only scrapes publicly available data
- Includes proper error handling and retries

## Dependencies

- scrapy: Web scraping framework
- pandas: Data analysis
- scrapy-user-agents: User agent rotation
- scrapy-proxy-pool: Proxy management
- sqlalchemy: Database operations (future use)

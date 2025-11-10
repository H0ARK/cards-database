# Scrapy settings for ebay_scraper project
#
# For simplicity, this file contains only settings considered important or
# commonly used. You can find more settings consulting the documentation:
#
#     https://docs.scrapy.org/en/latest/topics/settings.html
#     https://docs.scrapy.org/en/latest/topics/downloader-middleware.html
#     https://docs.scrapy.org/en/latest/topics/spider-middleware.html

BOT_NAME = "ebay_scraper"

SPIDER_MODULES = ["ebay_scraper.spiders"]
NEWSPIDER_MODULE = "ebay_scraper.spiders"

ADDONS = {}

# Obey robots.txt rules (can be disabled for testing)
# WARNING: eBay disallows automated search scraping in robots.txt
# Only disable for personal/research use and respect rate limits
ROBOTSTXT_OBEY = False  # Set to True for production ethical scraping

# Concurrency and throttling settings - Conservative for eBay
CONCURRENT_REQUESTS = 1  # Only 1 concurrent request total
CONCURRENT_REQUESTS_PER_DOMAIN = 1  # Only 1 per domain
DOWNLOAD_DELAY = 3  # 3 second delay between requests
RANDOMIZE_DOWNLOAD_DELAY = True  # Add jitter to delays

# Timeout settings
DOWNLOAD_TIMEOUT = 30  # 30 second timeout

# Retry settings
RETRY_ENABLED = True
RETRY_TIMES = 3
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]  # Include rate limiting

# Anti-detection settings
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]

# Anti-detection delay settings (used by our middleware)
MIN_DELAY = 2.0  # Minimum delay between requests to same domain
MAX_DELAY = 8.0  # Maximum delay between requests to same domain

# Default request headers (will be overridden by middleware)
DEFAULT_REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

# Enable and configure middlewares
DOWNLOADER_MIDDLEWARES = {
    'ebay_scraper.middlewares.AntiDetectionDownloaderMiddleware': 543,
    'scrapy_user_agents.middlewares.RandomUserAgentMiddleware': 400,
    'scrapy_proxy_pool.middlewares.ProxyPoolMiddleware': 610,
    'scrapy_proxy_pool.middlewares.BanDetectionMiddleware': 620,
}

SPIDER_MIDDLEWARES = {
    'ebay_scraper.middlewares.EbayScraperSpiderMiddleware': 543,
}

# Configure item pipelines
ITEM_PIPELINES = {
    'ebay_scraper.pipelines.ValidationPipeline': 100,
    'ebay_scraper.pipelines.DeduplicationPipeline': 200,
    'ebay_scraper.pipelines.DataAggregationPipeline': 300,
    'ebay_scraper.pipelines.JsonExportPipeline': 400,
}

# AutoThrottle extension (alternative to manual throttling)
AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 3
AUTOTHROTTLE_MAX_DELAY = 10
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0
AUTOTHROTTLE_DEBUG = False  # Set to True for debugging

# Logging configuration
LOG_LEVEL = 'INFO'
LOG_FORMAT = '%(levelname)s: %(message)s'

# Stats collection
STATS_CLASS = 'scrapy.statscollectors.MemoryStatsCollector'

# Cache settings (disabled by default, enable for development)
HTTPCACHE_ENABLED = False
HTTPCACHE_EXPIRATION_SECS = 3600  # 1 hour
HTTPCACHE_DIR = "httpcache"
HTTPCACHE_IGNORE_HTTP_CODES = [404, 500, 502, 503, 504]

# Feed exports (for debugging)
FEEDS = {
    # Uncomment to save all items to CSV for debugging
    # 'output/debug.csv': {
    #     'format': 'csv',
    #     'fields': ['ebay_id', 'title', 'price', 'condition', 'url', 'seller'],
    # },
}

# Set encoding
FEED_EXPORT_ENCODING = "utf-8"

# Telnet console (disabled for security)
TELNETCONSOLE_ENABLED = False

# Memory usage debugging (uncomment for memory issues)
# MEMUSAGE_ENABLED = True
# MEMUSAGE_LIMIT_MB = 512
# MEMUSAGE_WARNING_MB = 256

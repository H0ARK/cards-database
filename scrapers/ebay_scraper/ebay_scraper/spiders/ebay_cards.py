import scrapy
from urllib.parse import urlencode, urljoin
from datetime import datetime
import re
from ..items import EbayListingItem


class EbayCardsSpider(scrapy.Spider):
    name = "ebay_cards"
    allowed_domains = ["ebay.com", "ebay.co.uk", "ebay.ca", "ebay.com.au"]

    # Custom settings for this spider
    custom_settings = {
        'USER_AGENT': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'DOWNLOAD_DELAY': 2,  # Be respectful to eBay
        'CONCURRENT_REQUESTS': 1,  # Single request at a time
        # ROBOTSTXT_OBEY controlled by global settings
    }

    def __init__(self, search_query="pokemon cards", max_pages=5, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.search_query = search_query
        self.max_pages = int(max_pages)

    def start_requests(self):
        """Generate search URLs for different regions"""
        base_urls = [
            "https://www.ebay.com/sch/i.html",
            "https://www.ebay.co.uk/sch/i.html",
            "https://www.ebay.ca/sch/i.html",
        ]

        for base_url in base_urls:
            params = {
                '_nkw': self.search_query,
                '_sacat': '0',  # All categories
                'LH_ItemCondition': '3',  # Used items
                'LH_PrefLoc': '1',  # Located in country
                'rt': 'nc',  # No cache
                'LH_Sold': '1',  # Include sold listings
                'LH_Complete': '1',  # Completed listings
            }

            search_url = f"{base_url}?{urlencode(params)}"
            self.logger.info(f"Starting search: {search_url}")

            yield scrapy.Request(
                url=search_url,
                callback=self.parse_search_results,
                meta={'region': base_url.split('.')[1], 'page': 1}
            )

    def parse_search_results(self, response):
        """Parse search results page and extract listings"""
        region = response.meta['region']
        page = response.meta['page']

        self.logger.info(f"Parsing page {page} for region {region}")

        # Extract individual listings
        listings = response.css('li.s-item')

        for listing in listings:
            # Skip sponsored/featured items
            if listing.css('.s-item__detail--primary .s-item__ad'):
                continue

            item = self.extract_listing_data(listing, region)

            if item:
                yield item

        # Handle pagination
        if page < self.max_pages:
            next_page_url = self.get_next_page_url(response, page)
            if next_page_url:
                yield scrapy.Request(
                    url=next_page_url,
                    callback=self.parse_search_results,
                    meta={'region': region, 'page': page + 1}
                )

    def extract_listing_data(self, listing, region):
        """Extract data from a single listing"""
        try:
            # Extract basic info
            title_elem = listing.css('.s-item__title span[role="heading"]::text').get()
            if not title_elem or 'Shop on eBay' in title_elem:
                return None

            title = title_elem.strip()

            # Extract URL
            url_elem = listing.css('.s-item__link::attr(href)').get()
            if not url_elem:
                return None

            # Clean URL (remove tracking parameters)
            url = url_elem.split('?')[0] if '?' in url_elem else url_elem

            # Extract eBay item ID from URL
            ebay_id_match = re.search(r'/(\d{10,})\?', url)
            ebay_id = ebay_id_match.group(1) if ebay_id_match else None

            if not ebay_id:
                return None

            # Extract price
            price_text = listing.css('.s-item__price::text').get()
            if not price_text:
                return None

            price = self.parse_price(price_text.strip())

            # Extract seller info
            seller_elem = listing.css('.s-item__seller-info-text::text').get()
            seller = seller_elem.strip() if seller_elem else None

            # Extract location
            location_elem = listing.css('.s-item__location .s-item__detail::text').get()
            location = location_elem.strip() if location_elem else None

            # Extract shipping cost
            shipping_elem = listing.css('.s-item__shipping .s-item__detail::text').get()
            shipping_cost = self.parse_shipping_cost(shipping_elem) if shipping_elem else 0

            # Extract bids/time left
            bids_elem = listing.css('.s-item__bidCount::text').get()
            bids_count = self.parse_bids(bids_elem) if bids_elem else 0

            time_left_elem = listing.css('.s-item__time-left::text').get()
            time_left = time_left_elem.strip() if time_left_elem else None

            # Extract image URL
            image_elem = listing.css('.s-item__image img::attr(src)').get()
            image_url = image_elem if image_elem else None

            # Determine condition (this is tricky on search results)
            condition = self.infer_condition(title, price)

            # Extract date (not always available on search results)
            date = datetime.now().strftime('%Y-%m-%d')

            return EbayListingItem(
                ebay_id=ebay_id,
                title=title,
                price=price,
                price_text=price_text.strip(),
                condition=condition,
                date=date,
                url=url,
                image_url=image_url,
                seller=seller,
                location=location,
                shipping_cost=shipping_cost,
                bids_count=bids_count,
                time_left=time_left,
                scraped_at=datetime.now().isoformat()
            )

        except Exception as e:
            self.logger.error(f"Error extracting listing data: {e}")
            return None

    def get_next_page_url(self, response, current_page):
        """Extract next page URL"""
        next_page_link = response.css('a[aria-label*="next"], .pagination__next::attr(href)').get()
        if next_page_link:
            return urljoin(response.url, next_page_link)
        return None

    def parse_price(self, price_text):
        """Parse price from text (handles $1,234.56 format)"""
        if not price_text:
            return 0.0

        # Remove currency symbols and commas
        cleaned = re.sub(r'[$,£€¥]', '', price_text)
        # Extract first number (handles ranges)
        match = re.search(r'(\d+(?:\.\d{2})?)', cleaned)
        return float(match.group(1)) if match else 0.0

    def parse_shipping_cost(self, shipping_text):
        """Parse shipping cost"""
        if not shipping_text or 'FREE' in shipping_text.upper():
            return 0.0

        return self.parse_price(shipping_text)

    def parse_bids(self, bids_text):
        """Parse number of bids"""
        if not bids_text:
            return 0

        match = re.search(r'(\d+)', bids_text)
        return int(match.group(1)) if match else 0

    def infer_condition(self, title, price):
        """Infer card condition from title and price"""
        title_lower = title.lower()

        # Look for explicit condition mentions
        if any(term in title_lower for term in ['mint', 'near mint', 'nm', 'm']):
            return 'Near Mint'
        elif any(term in title_lower for term in ['excellent', 'ex']):
            return 'Excellent'
        elif any(term in title_lower for term in ['very good', 'vg']):
            return 'Very Good'
        elif any(term in title_lower for term in ['good', 'g']):
            return 'Good'
        elif any(term in title_lower for term in ['poor', 'p']):
            return 'Poor'
        elif any(term in title_lower for term in ['graded', 'psa', 'bgs', 'cgc', 'sgc']):
            return 'Graded'
        else:
            # Infer from price ranges (rough heuristics)
            if price < 1:
                return 'Poor'
            elif price < 5:
                return 'Good'
            elif price < 20:
                return 'Very Good'
            elif price < 100:
                return 'Excellent'
            else:
                return 'Near Mint'

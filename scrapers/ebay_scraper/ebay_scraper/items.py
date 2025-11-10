# Define here the models for your scraped items
#
# See documentation in:
# https://docs.scrapy.org/en/latest/topics/items.html

import scrapy


class EbayListingItem(scrapy.Item):
    """Item for eBay product listings"""
    ebay_id = scrapy.Field()
    title = scrapy.Field()
    price = scrapy.Field()
    price_text = scrapy.Field()
    condition = scrapy.Field()
    date = scrapy.Field()
    url = scrapy.Field()
    image_url = scrapy.Field()
    seller = scrapy.Field()
    location = scrapy.Field()
    shipping_cost = scrapy.Field()
    bids_count = scrapy.Field()
    time_left = scrapy.Field()
    scraped_at = scrapy.Field()

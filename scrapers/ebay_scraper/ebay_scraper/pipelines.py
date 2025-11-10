# Define your item pipelines here
#
# Don't forget to add your pipeline to the ITEM_PIPELINES setting
# See: https://docs.scrapy.org/en/latest/topics/item-pipeline.html

import json
import os
import pandas as pd
from datetime import datetime
from collections import defaultdict
from itemadapter import ItemAdapter


class ValidationPipeline:
    """Pipeline for validating and cleaning scraped items"""

    def process_item(self, item, spider):
        adapter = ItemAdapter(item)

        # Validate required fields
        required_fields = ['ebay_id', 'title', 'price', 'url']
        for field in required_fields:
            if not adapter.get(field):
                spider.logger.warning(f"Missing required field '{field}' for item {adapter.get('ebay_id', 'unknown')}")
                # Don't drop item, just log the issue

        # Clean and validate price
        if adapter.get('price'):
            try:
                price = float(adapter['price'])
                if price < 0:
                    spider.logger.warning(f"Negative price detected: {price}")
                    adapter['price'] = 0.0
                elif price > 100000:  # Sanity check
                    spider.logger.warning(f"Suspiciously high price detected: {price}")
            except (ValueError, TypeError):
                spider.logger.warning(f"Invalid price format: {adapter['price']}")
                adapter['price'] = 0.0

        # Validate URL format
        url = adapter.get('url', '')
        if url and not url.startswith(('http://', 'https://')):
            spider.logger.warning(f"Invalid URL format: {url}")

        # Ensure dates are properly formatted
        if adapter.get('scraped_at'):
            try:
                # Validate ISO format
                datetime.fromisoformat(adapter['scraped_at'].replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                adapter['scraped_at'] = datetime.now().isoformat()

        return item


class DeduplicationPipeline:
    """Pipeline for removing duplicate items based on ebay_id"""

    def __init__(self):
        self.seen_ids = set()

    def process_item(self, item, spider):
        adapter = ItemAdapter(item)
        ebay_id = adapter.get('ebay_id')

        if ebay_id in self.seen_ids:
            spider.logger.info(f"Duplicate item detected: {ebay_id}")
            # Return None to drop the item from the pipeline
            return None

        self.seen_ids.add(ebay_id)
        return item


class DataAggregationPipeline:
    """Pipeline for aggregating statistics and insights from scraped data"""

    def __init__(self):
        self.items = []
        self.stats = defaultdict(list)

    def process_item(self, item, spider):
        adapter = ItemAdapter(item)

        # Store item for later analysis
        self.items.append(dict(adapter))

        # Collect stats by condition
        condition = adapter.get('condition', 'Unknown')
        price = adapter.get('price', 0)

        if price > 0:
            self.stats[condition].append(price)

        return item

    def close_spider(self, spider):
        """Called when spider finishes - generate summary statistics"""
        if not self.items:
            spider.logger.info("No items to analyze")
            return

        # Create DataFrame for analysis
        df = pd.DataFrame(self.items)

        # Generate summary statistics
        summary = {
            'total_items': len(df),
            'unique_conditions': df['condition'].nunique() if 'condition' in df.columns else 0,
            'price_stats': {},
            'condition_breakdown': {},
            'scraped_at': datetime.now().isoformat()
        }

        # Price statistics
        if 'price' in df.columns and not df['price'].empty:
            valid_prices = df[df['price'] > 0]['price']
            if not valid_prices.empty:
                summary['price_stats'] = {
                    'mean': round(valid_prices.mean(), 2),
                    'median': round(valid_prices.median(), 2),
                    'min': round(valid_prices.min(), 2),
                    'max': round(valid_prices.max(), 2),
                    'count': len(valid_prices)
                }

        # Condition breakdown
        if 'condition' in df.columns:
            condition_counts = df['condition'].value_counts()
            summary['condition_breakdown'] = condition_counts.to_dict()

            # Price stats by condition
            summary['price_by_condition'] = {}
            for condition in condition_counts.index:
                condition_prices = df[(df['condition'] == condition) & (df['price'] > 0)]['price']
                if not condition_prices.empty:
                    summary['price_by_condition'][condition] = {
                        'count': len(condition_prices),
                        'mean': round(condition_prices.mean(), 2),
                        'median': round(condition_prices.median(), 2)
                    }

        # Save summary to file
        output_dir = getattr(spider, 'output_dir', 'output')
        os.makedirs(output_dir, exist_ok=True)

        summary_file = os.path.join(output_dir, f'summary_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json')
        with open(summary_file, 'w') as f:
            json.dump(summary, f, indent=2, default=str)

        spider.logger.info(f"Analysis complete. Summary saved to {summary_file}")


class JsonExportPipeline:
    """Pipeline for exporting items to JSON files"""

    def __init__(self):
        self.items = []
        self.file_count = 0
        self.items_per_file = 1000  # Save every 1000 items

    def process_item(self, item, spider):
        self.items.append(dict(ItemAdapter(item)))

        # Periodically save to file
        if len(self.items) >= self.items_per_file:
            self._save_batch(spider)

        return item

    def close_spider(self, spider):
        """Save remaining items when spider closes"""
        if self.items:
            self._save_batch(spider, final=True)

    def _save_batch(self, spider, final=False):
        """Save a batch of items to JSON file"""
        output_dir = getattr(spider, 'output_dir', 'output')
        os.makedirs(output_dir, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        suffix = "_final" if final else f"_{self.file_count}"
        filename = f"ebay_listings_{timestamp}{suffix}.json"

        filepath = os.path.join(output_dir, filename)

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': {
                    'spider': spider.name,
                    'items_count': len(self.items),
                    'exported_at': datetime.now().isoformat(),
                    'search_query': getattr(spider, 'search_query', 'unknown')
                },
                'items': self.items
            }, f, indent=2, ensure_ascii=False, default=str)

        spider.logger.info(f"Exported {len(self.items)} items to {filepath}")
        self.items = []
        self.file_count += 1


class EbayScraperPipeline:
    """Legacy pipeline - kept for compatibility"""
    def process_item(self, item, spider):
        return item

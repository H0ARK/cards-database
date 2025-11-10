# Define here the models for your spider middleware
#
# See documentation in:
# https://docs.scrapy.org/en/latest/topics/spider-middleware.html

from scrapy import signals
import random
import time
import logging
from scrapy.exceptions import IgnoreRequest

# useful for handling different item types with a single interface
from itemadapter import ItemAdapter

# List of realistic user agents for rotation
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Safari/537.36',
]


class EbayScraperSpiderMiddleware:
    # Not all methods need to be defined. If a method is not defined,
    # scrapy acts as if the spider middleware does not modify the
    # passed objects.

    @classmethod
    def from_crawler(cls, crawler):
        # This method is used by Scrapy to create your spiders.
        s = cls()
        crawler.signals.connect(s.spider_opened, signal=signals.spider_opened)
        return s

    def process_spider_input(self, response, spider):
        # Called for each response that goes through the spider
        # middleware and into the spider.

        # Should return None or raise an exception.
        return None

    def process_spider_output(self, response, result, spider):
        # Called with the results returned from the Spider, after
        # it has processed the response.

        # Must return an iterable of Request, or item objects.
        for i in result:
            yield i

    def process_spider_exception(self, response, exception, spider):
        # Called when a spider or process_spider_input() method
        # (from other spider middleware) raises an exception.

        # Should return either None or an iterable of Request or item objects.
        pass

    async def process_start(self, start):
        # Called with an async iterator over the spider start() method or the
        # maching method of an earlier spider middleware.
        async for item_or_request in start:
            yield item_or_request

    def spider_opened(self, spider):
        spider.logger.info("Spider opened: %s" % spider.name)


class AntiDetectionDownloaderMiddleware:
    """Downloader middleware for anti-detection measures"""

    def __init__(self, user_agents=None, min_delay=1, max_delay=5):
        self.user_agents = user_agents or USER_AGENTS
        self.min_delay = min_delay
        self.max_delay = max_delay
        self.last_request_time = {}

    @classmethod
    def from_crawler(cls, crawler):
        # Get settings from crawler
        user_agents = crawler.settings.getlist('USER_AGENTS', USER_AGENTS)
        min_delay = crawler.settings.getfloat('MIN_DELAY', 1)
        max_delay = crawler.settings.getfloat('MAX_DELAY', 5)

        s = cls(user_agents=user_agents, min_delay=min_delay, max_delay=max_delay)
        crawler.signals.connect(s.spider_opened, signal=signals.spider_opened)
        crawler.signals.connect(s.spider_closed, signal=signals.spider_closed)
        return s

    def process_request(self, request, spider):
        """Add anti-detection measures to each request"""
        # Rotate user agent
        user_agent = random.choice(self.user_agents)
        request.headers['User-Agent'] = user_agent

        # Add some realistic headers
        request.headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        request.headers['Accept-Language'] = 'en-US,en;q=0.5'
        request.headers['Accept-Encoding'] = 'gzip, deflate'
        request.headers['DNT'] = '1'
        request.headers['Connection'] = 'keep-alive'
        request.headers['Upgrade-Insecure-Requests'] = '1'

        # Add random viewport size (simulate different devices)
        viewport_width = random.choice([1366, 1920, 1440, 1536])
        viewport_height = random.choice([768, 1080, 900, 864])
        request.meta['viewport'] = f'{viewport_width}x{viewport_height}'

        # Implement rate limiting with jitter
        domain = self._get_domain_from_url(request.url)
        current_time = time.time()

        if domain in self.last_request_time:
            time_since_last = current_time - self.last_request_time[domain]
            min_required_delay = random.uniform(self.min_delay, self.max_delay)

            if time_since_last < min_required_delay:
                sleep_time = min_required_delay - time_since_last + random.uniform(0.1, 0.5)
                spider.logger.debug(f"Rate limiting: sleeping {sleep_time:.2f}s for {domain}")
                time.sleep(sleep_time)

        self.last_request_time[domain] = time.time()

        spider.logger.debug(f"Requesting {request.url} with UA: {user_agent[:50]}...")

    def process_response(self, request, response, spider):
        """Process response and handle potential blocks"""
        # Check for common blocking indicators
        if response.status in [403, 429, 503]:
            spider.logger.warning(f"Possible blocking detected: {response.status} for {request.url}")
            # Could implement retry logic here with different proxy/user agent

        elif 'captcha' in response.text.lower() or 'blocked' in response.text.lower():
            spider.logger.warning(f"CAPTCHA or block detected in response from {request.url}")
            # Could raise IgnoreRequest here to skip this request

        return response

    def process_exception(self, request, exception, spider):
        """Handle exceptions (network errors, timeouts, etc.)"""
        spider.logger.error(f"Request failed: {request.url} - {exception}")

        # Could implement retry logic with exponential backoff here
        # For now, just log and let Scrapy handle retries

    def spider_opened(self, spider):
        spider.logger.info(f"Anti-detection middleware enabled for spider: {spider.name}")

    def spider_closed(self, spider):
        spider.logger.info(f"Spider closed: {spider.name}")

    def _get_domain_from_url(self, url):
        """Extract domain from URL for rate limiting"""
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.netloc


class EbayScraperDownloaderMiddleware:
    """Legacy downloader middleware - kept for compatibility"""
    # Not all methods need to be defined. If a method is not defined,
    # scrapy acts as if the downloader middleware does not modify the
    # passed objects.

    @classmethod
    def from_crawler(cls, crawler):
        # This method is used by Scrapy to create your spiders.
        s = cls()
        crawler.signals.connect(s.spider_opened, signal=signals.spider_opened)
        return s

    def process_request(self, request, spider):
        # Called for each request that goes through the downloader
        # middleware.

        # Must either:
        # - return None: continue processing this request
        # - or return a Response object
        # - or return a Request object
        # - or raise IgnoreRequest: process_exception() methods of
        #   installed downloader middleware will be called
        return None

    def process_response(self, request, response, spider):
        # Called with the response returned from the downloader.

        # Must either;
        # - return a Response object
        # - return a Request object
        # - or raise IgnoreRequest
        return response

    def process_exception(self, request, exception, spider):
        # Called when a download handler or a process_request()
        # (from other downloader middleware) raises an exception.

        # Must either:
        # - return None: continue processing this exception
        # - return a Response object: stops process_exception() chain
        # - return a Request object: stops process_exception() chain
        pass

    def spider_opened(self, spider):
        spider.logger.info("Spider opened: %s" % spider.name)

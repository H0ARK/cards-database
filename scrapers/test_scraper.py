#!/usr/bin/env python3
"""
Test script for eBay scraper
Tests various search queries and settings
"""

import subprocess
import sys
import os
from pathlib import Path

def run_test(search_query, max_pages=1, description=""):
    """Run a test scrape with given parameters"""
    print(f"\n{'='*60}")
    print(f"Testing: {description}")
    print(f"Query: {search_query}")
    print(f"Pages: {max_pages}")
    print('='*60)

    # Create test output directory
    test_output = f"test_output_{search_query.replace(' ', '_')[:20]}"
    os.makedirs(test_output, exist_ok=True)

    # Run scraper
    cmd = [
        "scrapy", "crawl", "ebay_cards",
        "-a", f"search_query={search_query}",
        "-a", f"max_pages={max_pages}",
        "-s", f"output_dir={test_output}",
        "-L", "INFO"
    ]

    try:
        result = subprocess.run(cmd, cwd="ebay_scraper", capture_output=False, text=True, timeout=300)
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        print("Test timed out after 5 minutes")
        return False
    except KeyboardInterrupt:
        print("Test interrupted")
        return False

def main():
    """Run various test scenarios"""
    print("eBay Scraper Test Suite")
    print("=======================")

    # Change to scrapers directory
    os.chdir(Path(__file__).parent)

    # Activate virtual environment
    activate_cmd = "source venv/bin/activate && "
    os.environ['PATH'] = f"{os.getcwd()}/venv/bin:" + os.environ['PATH']

    # Test cases - start simple
    test_cases = [
        ("pokemon test", 1, "Simple Pokemon search"),
        ("yugioh test", 1, "YuGiOh search"),
        ("magic test", 1, "Magic: The Gathering search"),
    ]

    results = []

    for query, pages, desc in test_cases:
        success = run_test(query, pages, desc)
        results.append((desc, success))

        if not success:
            print(f"❌ {desc} failed")
        else:
            print(f"✅ {desc} passed")

    # Summary
    print(f"\n{'='*60}")
    print("TEST SUMMARY")
    print('='*60)

    passed = sum(1 for _, success in results if success)
    total = len(results)

    for desc, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {desc}")

    print(f"\nPassed: {passed}/{total}")

    if passed == total:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())


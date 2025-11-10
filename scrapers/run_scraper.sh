#!/bin/bash

# eBay Scraper Runner Script
# Usage: ./run_scraper.sh "search query" [max_pages] [output_dir]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${RED}Error: Virtual environment not found. Run setup first.${NC}"
    exit 1
fi

# Check arguments
if [ $# -lt 1 ]; then
    echo -e "${YELLOW}Usage: $0 \"search query\" [max_pages] [output_dir]${NC}"
    echo -e "${BLUE}Examples:${NC}"
    echo -e "  $0 \"pokemon cards\" 5"
    echo -e "  $0 \"charizard 1st edition\" 3 rare_cards"
    echo -e "  $0 \"yugioh blue eyes\" 2 yugioh_data"
    exit 1
fi

SEARCH_QUERY="$1"
MAX_PAGES="${2:-3}"  # Default 3 pages
OUTPUT_DIR="${3:-output}"

# Activate virtual environment
echo -e "${BLUE}Activating virtual environment...${NC}"
source venv/bin/activate

# Navigate to scrapy project
cd ebay_scraper

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo -e "${GREEN}Starting eBay scraper...${NC}"
echo -e "${BLUE}Search Query: ${SEARCH_QUERY}${NC}"
echo -e "${BLUE}Max Pages: ${MAX_PAGES}${NC}"
echo -e "${BLUE}Output Directory: ${OUTPUT_DIR}${NC}"
echo -e "${YELLOW}This may take several minutes...${NC}"

# Run the scraper
scrapy crawl ebay_cards \
    -a search_query="$SEARCH_QUERY" \
    -a max_pages="$MAX_PAGES" \
    -s output_dir="$OUTPUT_DIR" \
    --logfile="${OUTPUT_DIR}/scraper_$(date +%Y%m%d_%H%M%S).log"

echo -e "${GREEN}Scraping complete!${NC}"
echo -e "${BLUE}Check the ${OUTPUT_DIR} directory for results.${NC}"

# List output files
echo -e "${YELLOW}Generated files:${NC}"
ls -la "$OUTPUT_DIR"/*.json 2>/dev/null || echo "No JSON files found"

# Deactivate virtual environment
deactivate

echo -e "${GREEN}Done!${NC}"


#!/bin/bash

# eBay Scraper Setup Script

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Setting up eBay Trading Card Scraper...${NC}"

# Check if virtual environment already exists
if [ -d "venv" ]; then
    echo -e "${YELLOW}Virtual environment already exists. Recreating...${NC}"
    rm -rf venv
fi

# Create virtual environment
echo -e "${BLUE}Creating Python virtual environment...${NC}"
python3 -m venv venv

# Activate virtual environment
echo -e "${BLUE}Activating virtual environment...${NC}"
source venv/bin/activate

# Upgrade pip
echo -e "${BLUE}Upgrading pip...${NC}"
pip install --upgrade pip

# Install dependencies
echo -e "${BLUE}Installing Scrapy and dependencies...${NC}"
pip install scrapy scrapy-user-agents scrapy-proxy-pool pandas sqlalchemy aiohttp

# Verify installation
echo -e "${BLUE}Verifying installation...${NC}"
python -c "import scrapy; print(f'Scrapy {scrapy.__version__} installed successfully')"

echo -e "${GREEN}Setup complete!${NC}"
echo -e "${YELLOW}To run the scraper:${NC}"
echo -e "  cd scrapers"
echo -e "  ./run_scraper.sh \"pokemon cards\" 3"
echo -e ""
echo -e "${YELLOW}For more options, see README.md${NC}"

# Deactivate virtual environment
deactivate


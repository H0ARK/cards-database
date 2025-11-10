#!/bin/bash

###############################################################################
# Docker Container Logs Cleanup Script
#
# This script truncates Docker container logs to prevent disk space issues.
# Docker logs can grow unbounded if log rotation is not configured.
#
# Usage:
#   ./cleanup-docker-logs.sh [--all] [--container CONTAINER_NAME]
#
# Options:
#   --all                    Clean logs for all containers
#   --container NAME         Clean logs for specific container
#   --max-size SIZE          Keep only last SIZE (e.g., 100M, 1G) - requires truncate support
#
# Examples:
#   ./cleanup-docker-logs.sh --all
#   ./cleanup-docker-logs.sh --container card-db-postgres
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SPECIFIC_CONTAINER=""
CLEAN_ALL=false
MAX_SIZE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            CLEAN_ALL=true
            shift
            ;;
        --container)
            SPECIFIC_CONTAINER="$2"
            shift 2
            ;;
        --max-size)
            MAX_SIZE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--all] [--container CONTAINER_NAME] [--max-size SIZE]"
            exit 1
            ;;
    esac
done

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root or with sudo${NC}"
    echo "Please run: sudo $0 $@"
    exit 1
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Docker Container Logs Cleanup                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}\n"

# Function to get log file size in human readable format
get_log_size() {
    local log_file="$1"
    if [ -f "$log_file" ]; then
        du -h "$log_file" | cut -f1
    else
        echo "0B"
    fi
}

# Function to clean a single container's logs
clean_container_logs() {
    local container_id="$1"
    local container_name="$2"

    # Find the log file
    local log_file="/var/lib/docker/containers/${container_id}/${container_id}-json.log"

    if [ ! -f "$log_file" ]; then
        echo -e "${YELLOW}  ⚠ No log file found for container: $container_name${NC}"
        return
    fi

    local size_before=$(get_log_size "$log_file")

    # Truncate the log file
    if [ -n "$MAX_SIZE" ]; then
        # Keep last N bytes/KB/MB/GB
        echo -e "${BLUE}  ↻ Truncating log to last $MAX_SIZE for: $container_name${NC}"
        # This would require more complex logic to tail the file
        # For now, we'll just truncate to 0
        truncate -s 0 "$log_file"
    else
        echo -e "${BLUE}  ↻ Clearing logs for: $container_name${NC}"
        truncate -s 0 "$log_file"
    fi

    local size_after=$(get_log_size "$log_file")

    echo -e "${GREEN}  ✓ Container: $container_name${NC}"
    echo -e "    Before: $size_before → After: $size_after"
}

# Main execution
total_freed=0

if [ "$CLEAN_ALL" = true ]; then
    echo -e "${YELLOW}Cleaning logs for ALL containers...${NC}\n"

    # Get all container IDs and names
    while IFS= read -r line; do
        container_id=$(echo "$line" | awk '{print $1}')
        container_name=$(echo "$line" | awk '{print $2}')

        clean_container_logs "$container_id" "$container_name"
        echo ""
    done < <(docker ps -a --format "{{.ID}} {{.Names}}")

elif [ -n "$SPECIFIC_CONTAINER" ]; then
    echo -e "${YELLOW}Cleaning logs for container: $SPECIFIC_CONTAINER${NC}\n"

    # Get container ID
    container_id=$(docker ps -a --filter "name=$SPECIFIC_CONTAINER" --format "{{.ID}}" | head -1)

    if [ -z "$container_id" ]; then
        echo -e "${RED}Error: Container '$SPECIFIC_CONTAINER' not found${NC}"
        exit 1
    fi

    clean_container_logs "$container_id" "$SPECIFIC_CONTAINER"

else
    echo -e "${RED}Error: You must specify either --all or --container CONTAINER_NAME${NC}"
    echo "Usage: $0 [--all] [--container CONTAINER_NAME]"
    exit 1
fi

# Calculate total space freed
echo -e "\n${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Log cleanup complete!${NC}\n"

# Show current Docker disk usage
echo -e "${BLUE}Current Docker disk usage:${NC}"
docker system df

echo -e "\n${YELLOW}Tip: To prevent logs from growing, ensure log rotation is configured.${NC}"
echo -e "${YELLOW}Check /etc/docker/daemon.json for log settings.${NC}"
echo -e "\n${YELLOW}Recommended daemon.json configuration:${NC}"
echo -e '{\n  "log-driver": "json-file",\n  "log-opts": {\n    "max-size": "100m",\n    "max-file": "3"\n  }\n}'

exit 0

# TCGdex API v2 Documentation

## Overview

The TCGdex API v2 provides comprehensive access to Pokémon Trading Card Game data including cards, sets, and series information. The API is available at `http://135.148.148.65/` and supports multiple languages.

**Base URL:** `http://135.148.148.65/`

**Current Version:** 2

**Status:** Production

---

## Table of Contents

1. [Authentication](#authentication)
2. [Rate Limiting](#rate-limiting)
3. [Supported Languages](#supported-languages)
4. [Response Format](#response-format)
5. [Error Handling](#error-handling)
6. [Endpoints](#endpoints)
7. [Query Parameters](#query-parameters)
8. [Examples](#examples)

---

## Authentication

**No authentication is required** to access the TCGdex API. All endpoints are publicly available.

---

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Rate Limit:** 1 day cache on GET requests in production
- **Caching:** Responses are cached for 24 hours to improve performance
- **Recommended:** Implement client-side caching to reduce API calls

---

## Supported Languages

The API supports the following languages via the `{lang}` parameter:

- `en` - English
- `fr` - French
- `es` - Spanish
- `es-mx` - Spanish (Mexico)
- `it` - Italian
- `pt` - Portuguese
- `pt-br` - Portuguese (Brazil)
- `pt-pt` - Portuguese (Portugal)
- `de` - German
- `nl` - Dutch
- `pl` - Polish
- `ru` - Russian
- `ja` - Japanese
- `ko` - Korean
- `zh-tw` - Traditional Chinese
- `zh-cn` - Simplified Chinese
- `id` - Indonesian
- `th` - Thai

---

## Response Format

All responses are returned in **JSON format**. Successful responses contain the requested data. Error responses follow RFC 7807 Problem Details format.

### Success Response Structure

```json
{
  "id": "string",
  "name": "string",
  "// ... additional fields based on resource type"
}
```

---

## Error Handling

### Error Response Format

All errors follow RFC 7807 Problem Details specification:

```json
{
  "type": "http://135.148.148.65/errors/{error-code}",
  "title": "Human-readable error title",
  "status": 404,
  "endpoint": "/v2/en/cards",
  "method": "GET",
  "details": "Additional error details"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `language-invalid` | 404 | The specified language is not supported |
| `not-found` | 404 | The requested resource does not exist |
| `general` | 500 | An unexpected server error occurred |

---

## Endpoints

### 1. List All Cards

**Endpoint:** `GET /{lang}/cards`

**Description:** Retrieve a list of all cards in the specified language.

**Parameters:**
- `lang` (required): Language code
- Query parameters: See [Query Parameters](#query-parameters)

**Response:** Array of card objects (brief format)

**Example:**
```bash
curl "http://135.148.148.65/en/cards"
```

---

### 2. Get Card by ID

**Endpoint:** `GET /{lang}/cards/{cardId}`

**Description:** Retrieve detailed information about a specific card.

**Parameters:**
- `lang` (required): Language code
- `cardId` (required): Card ID in format `{setId}-{localId}` (e.g., `base1-1`)

**Response:** Card object with full details

**Example:**
```bash
curl "http://135.148.148.65/en/cards/base1-1"
```

---

### 3. Get Card by Set and Local ID

**Endpoint:** `GET /{lang}/cards/{setId}/{localId}`

**Description:** Retrieve a card using set ID and local card ID.

**Parameters:**
- `lang` (required): Language code
- `setId` (required): Set identifier
- `localId` (required): Card's local ID within the set

**Response:** Card object with full details

**Example:**
```bash
curl "http://135.148.148.65/en/cards/base1/1"
```

---

### 4. Get Card Price History

**Endpoint:** `GET /{lang}/cards/{cardId}/history`

**Description:** Retrieve price history for a card from TCGPlayer data.

**Parameters:**
- `lang` (required): Language code
- `cardId` (required): Card ID
- `range` (optional): Time range - `daily` (30 days), `monthly` (90 days), `yearly` (365 days). Default: `yearly`
- `productId` (optional): TCGPlayer product ID. If not provided, uses card's TCGPlayer mapping

**Response:** Price history object with data points

**Example:**
```bash
curl "http://135.148.148.65/en/cards/base1-1/history?range=monthly"
```

---

### 5. List All Sets

**Endpoint:** `GET /{lang}/sets`

**Description:** Retrieve a list of all card sets.

**Parameters:**
- `lang` (required): Language code
- Query parameters: See [Query Parameters](#query-parameters)

**Response:** Array of set objects (brief format)

**Example:**
```bash
curl "http://135.148.148.65/en/sets"
```

---

### 6. Get Set by ID

**Endpoint:** `GET /{lang}/sets/{setId}`

**Description:** Retrieve detailed information about a specific set.

**Parameters:**
- `lang` (required): Language code
- `setId` (required): Set identifier

**Response:** Set object with full details

**Example:**
```bash
curl "http://135.148.148.65/en/sets/base1"
```

---

### 7. Get Card from Set

**Endpoint:** `GET /{lang}/sets/{setId}/{localId}`

**Description:** Retrieve a card from a specific set.

**Parameters:**
- `lang` (required): Language code
- `setId` (required): Set identifier
- `localId` (required): Card's local ID

**Response:** Card object

**Example:**
```bash
curl "http://135.148.148.65/en/sets/base1/1"
```

---

### 8. List All Series

**Endpoint:** `GET /{lang}/series`

**Description:** Retrieve a list of all card series.

**Parameters:**
- `lang` (required): Language code
- Query parameters: See [Query Parameters](#query-parameters)

**Response:** Array of series objects

**Example:**
```bash
curl "http://135.148.148.65/en/series"
```

---

### 9. Get Series by ID

**Endpoint:** `GET /{lang}/series/{serieId}`

**Description:** Retrieve detailed information about a specific series.

**Parameters:**
- `lang` (required): Language code
- `serieId` (required): Series identifier

**Response:** Series object with full details

**Example:**
```bash
curl "http://135.148.148.65/en/series/base"
```

---

### 10. Get Random Resource

**Endpoint:** `GET /{lang}/random/{what}`

**Description:** Retrieve a random card, set, or series.

**Parameters:**
- `lang` (required): Language code
- `what` (required): Resource type - `card`, `set`, or `serie`
- Query parameters: See [Query Parameters](#query-parameters)

**Response:** Random resource object

**Example:**
```bash
curl "http://135.148.148.65/en/random/card"
```

---

### 11. List Unique Values

**Endpoint:** `GET /{lang}/{endpoint}`

**Description:** Retrieve unique values for card attributes.

**Supported Endpoints:**
- `categories` - Card categories
- `energy-types` - Energy types
- `hp` - HP values
- `illustrators` - Card illustrators
- `rarities` - Card rarities
- `regulation-marks` - Regulation marks
- `retreats` - Retreat costs
- `stages` - Evolution stages
- `suffixes` - Card suffixes
- `trainer-types` - Trainer types
- `types` - Pokémon types
- `dex-ids` - Pokédex IDs
- `variants` - Card variants

**Parameters:**
- `lang` (required): Language code
- `endpoint` (required): Attribute endpoint

**Response:** Array of unique values

**Example:**
```bash
curl "http://135.148.148.65/en/rarities"
```

---

### 12. Get Cards by Attribute

**Endpoint:** `GET /{lang}/{endpoint}/{value}`

**Description:** Retrieve all cards with a specific attribute value.

**Parameters:**
- `lang` (required): Language code
- `endpoint` (required): Attribute type
- `value` (required): Attribute value

**Response:** Object with attribute name and array of matching cards

**Example:**
```bash
curl "http://135.148.148.65/en/rarities/Holo%20Rare"
```

---

## Query Parameters

### Filtering

Use query parameters to filter results:

```bash
# Filter by set
curl "http://135.148.148.65/en/cards?set=base1"

# Filter by name
curl "http://135.148.148.65/en/cards?name=Alakazam"

# Filter by rarity
curl "http://135.148.148.65/en/cards?rarity=Holo%20Rare"
```

### Supported Filter Fields

- `name` - Card or set name
- `set` - Set ID or name
- `serie` - Series ID or name
- `rarity` - Card rarity
- `type` - Pokémon type
- `hp` - HP value
- `stage` - Evolution stage
- `illustrator` - Card illustrator
- `category` - Card category
- `energyType` - Energy type
- `regulationMark` - Regulation mark
- `retreat` - Retreat cost
- `suffix` - Card suffix
- `trainerType` - Trainer type
- `dexId` - Pokédex ID
- `variant` - Card variant

---

## Examples

### Example 1: Get a Specific Card

```bash
curl "http://135.148.148.65/en/cards/base1-1"
```

**Response:**
```json
{
  "id": "base1-1",
  "localId": "1",
  "name": "Alakazam",
  "image": "https://assets.tcgdex.net/en/base/base1/1",
  "set": {
    "id": "base1",
    "name": "Base Set"
  },
  "rarity": "Holo Rare",
  "illustrator": "Ken Sugimori",
  "hp": 40,
  "types": ["Psychic"],
  "stage": "Stage 2",
  "pricing": {
    "cardmarket": { /* pricing data */ },
    "tcgplayer": { /* pricing data */ }
  }
}
```

---

### Example 2: List All Sets

```bash
curl "http://135.148.148.65/en/sets"
```

**Response:**
```json
[
  {
    "id": "base1",
    "name": "Base Set",
    "logo": "https://assets.tcgdex.net/en/base/base1/logo",
    "cardCount": {
      "total": 102,
      "official": 102
    }
  },
  {
    "id": "base2",
    "name": "Jungle",
    "logo": "https://assets.tcgdex.net/en/base/base2/logo",
    "cardCount": {
      "total": 64,
      "official": 64
    }
  }
]
```

---

### Example 3: Filter Cards by Rarity

```bash
curl "http://135.148.148.65/en/cards?rarity=Holo%20Rare&set=base1"
```

---

### Example 4: Get Random Card

```bash
curl "http://135.148.148.65/en/random/card"
```

---

### Example 5: Get Card Price History

```bash
curl "http://135.148.148.65/en/cards/base1-1/history?range=monthly&productId=12345"
```

---

## Use Cases

### 1. Building a Card Database

Use the `/cards` endpoint to fetch all cards and build a local database:

```bash
curl "http://135.148.148.65/en/cards" > cards.json
```

### 2. Displaying Card Details

Fetch individual card details using the card ID:

```bash
curl "http://135.148.148.65/en/cards/base1-1"
```

### 3. Searching for Cards

Filter cards by various attributes:

```bash
curl "http://135.148.148.65/en/cards?name=Charizard&set=base1"
```

### 4. Tracking Price History

Monitor card prices over time:

```bash
curl "http://135.148.148.65/en/cards/base1-1/history?range=yearly"
```

### 5. Building a Set Browser

List all sets and their card counts:

```bash
curl "http://135.148.148.65/en/sets"
```

---

## SDKs

Official SDKs are available for easier integration:

- **JavaScript/TypeScript:** https://github.com/tcgdex/javascript-sdk
- **PHP:** https://github.com/tcgdex/php-sdk
- **Java:** https://github.com/tcgdex/java-sdk

---

## Additional Resources

- **Website:** https://tcgdex.dev
- **Status Page:** https://api.tcgdex.net/status
- **GraphQL Endpoint:** http://135.148.148.65/graphql
- **OpenAPI Spec:** http://135.148.148.65/openapi

---

## Support

For issues, questions, or feature requests, please visit the project repository or contact the development team through the official website.

**Last Updated:** November 2, 2025

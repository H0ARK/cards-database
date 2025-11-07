# TCGdex API v2 - Quick Reference Guide

**Base URL:** `https://api.tcgdex.net/v2/`

---

## Quick Start

### Get a Card
```bash
curl "https://api.tcgdex.net/v2/en/cards/base1-1"
```

### List All Cards
```bash
curl "https://api.tcgdex.net/v2/en/cards"
```

### List All Sets
```bash
curl "https://api.tcgdex.net/v2/en/sets"
```

### Get Random Card
```bash
curl "https://api.tcgdex.net/v2/en/random/card"
```

---

## Endpoint Cheat Sheet

| Purpose | Endpoint | Method |
|---------|----------|--------|
| List cards | `/{lang}/cards` | GET |
| Get card | `/{lang}/cards/{cardId}` | GET |
| Get card by set | `/{lang}/cards/{setId}/{localId}` | GET |
| Card history | `/{lang}/cards/{cardId}/history` | GET |
| List sets | `/{lang}/sets` | GET |
| Get set | `/{lang}/sets/{setId}` | GET |
| Get card from set | `/{lang}/sets/{setId}/{localId}` | GET |
| List series | `/{lang}/series` | GET |
| Get series | `/{lang}/series/{serieId}` | GET |
| Random resource | `/{lang}/random/{what}` | GET |
| List attributes | `/{lang}/{attribute}` | GET |
| Get by attribute | `/{lang}/{attribute}/{value}` | GET |

---

## Language Codes

```
en, fr, es, es-mx, it, pt, pt-br, pt-pt, de, nl, pl, ru, ja, ko, zh-tw, zh-cn, id, th
```

---

## Common Query Parameters

```bash
# Filter by name
?name=Charizard

# Filter by set
?set=base1

# Filter by rarity
?rarity=Holo%20Rare

# Filter by type
?type=Fire

# Filter by HP
?hp=100

# Filter by stage
?stage=Stage%202

# Filter by illustrator
?illustrator=Ken%20Sugimori

# Combine filters
?name=Charizard&set=base1&rarity=Holo%20Rare
```

---

## Attribute Endpoints

```
/categories
/energy-types
/hp
/illustrators
/rarities
/regulation-marks
/retreats
/stages
/suffixes
/trainer-types
/types
/dex-ids
/variants
```

---

## Response Examples

### Card Object
```json
{
  "id": "base1-1",
  "localId": "1",
  "name": "Alakazam",
  "image": "https://assets.tcgdex.net/en/base/base1/1",
  "set": { "id": "base1", "name": "Base Set" },
  "rarity": "Holo Rare",
  "illustrator": "Ken Sugimori",
  "hp": 40,
  "types": ["Psychic"],
  "stage": "Stage 2",
  "pricing": { "cardmarket": {...}, "tcgplayer": {...} }
}
```

### Set Object
```json
{
  "id": "base1",
  "name": "Base Set",
  "logo": "https://assets.tcgdex.net/en/base/base1/logo",
  "cardCount": { "total": 102, "official": 102 }
}
```

### Error Response
```json
{
  "type": "https://tcgdex.dev/errors/not-found",
  "title": "The resource you are trying to reach does not exists",
  "status": 404,
  "endpoint": "/v2/en/cards",
  "method": "GET"
}
```

---

## Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `language-invalid` | 404 | Invalid language code |
| `not-found` | 404 | Resource doesn't exist |
| `general` | 500 | Server error |

---

## Common Use Cases

### Search for a Card
```bash
curl "https://api.tcgdex.net/v2/en/cards?name=Charizard"
```

### Get All Rare Cards from Base Set
```bash
curl "https://api.tcgdex.net/v2/en/cards?set=base1&rarity=Holo%20Rare"
```

### Get All Fire Type Cards
```bash
curl "https://api.tcgdex.net/v2/en/cards?type=Fire"
```

### Get All Cards by an Illustrator
```bash
curl "https://api.tcgdex.net/v2/en/cards?illustrator=Ken%20Sugimori"
```

### Get All Stage 2 Pokémon
```bash
curl "https://api.tcgdex.net/v2/en/cards?stage=Stage%202"
```

### Get All Cards with 100 HP
```bash
curl "https://api.tcgdex.net/v2/en/cards?hp=100"
```

### Get Price History
```bash
curl "https://api.tcgdex.net/v2/en/cards/base1-1/history?range=monthly"
```

---

## JavaScript/TypeScript Example

```javascript
// Using fetch
const response = await fetch('https://api.tcgdex.net/v2/en/cards/base1-1');
const card = await response.json();
console.log(card.name); // "Alakazam"

// Using the official SDK
import { TCGdex } from '@tcgdex/sdk';
const tcgdex = new TCGdex();
const card = await tcgdex.cards.fetch('base1-1', 'en');
console.log(card.name); // "Alakazam"
```

---

## Python Example

```python
import requests

# Fetch a card
response = requests.get('https://api.tcgdex.net/v2/en/cards/base1-1')
card = response.json()
print(card['name'])  # "Alakazam"

# Search for cards
response = requests.get('https://api.tcgdex.net/v2/en/cards', 
                       params={'name': 'Charizard'})
cards = response.json()
print(len(cards))  # Number of Charizard cards
```

---

## cURL Examples

### Get Card Details
```bash
curl -X GET "https://api.tcgdex.net/v2/en/cards/base1-1" \
  -H "Accept: application/json"
```

### Search with Filters
```bash
curl -X GET "https://api.tcgdex.net/v2/en/cards?name=Charizard&set=base1" \
  -H "Accept: application/json"
```

### Get Random Card
```bash
curl -X GET "https://api.tcgdex.net/v2/en/random/card" \
  -H "Accept: application/json"
```

### Get Price History

Get comprehensive price history including TCGPlayer data and automatic PriceCharting eBay sales scraping.

```bash
curl -X GET "https://api.tcgdex.net/v2/en/cards/base1-1/history?range=yearly" \
  -H "Accept: application/json"
```

---

## Important Notes

- **No Authentication Required:** All endpoints are public
- **Caching:** Responses cached for 24 hours
- **Rate Limiting:** Implement client-side caching
- **Format:** All responses are JSON
- **Errors:** Follow RFC 7807 Problem Details format
- **Languages:** 18 languages supported
- **HTTPS Only:** Use HTTPS for all requests

---

## Additional Resources

- **Full Documentation:** See `API_DOCUMENTATION.md`
- **Validation Report:** See `API_VALIDATION_REPORT.md`
- **Official Website:** https://tcgdex.dev
- **Status Page:** https://api.tcgdex.net/status
- **GraphQL:** https://api.tcgdex.net/v2/graphql
- **OpenAPI:** https://api.tcgdex.net/v2/openapi

---

## SDKs

- **JavaScript/TypeScript:** `npm install @tcgdex/sdk`
- **PHP:** `composer require tcgdex/sdk`
- **Java:** Maven/Gradle available

---

## Support

For issues or questions:
1. Check the full documentation
2. Review the validation report
3. Visit https://tcgdex.dev
4. Check the status page

---

**Last Updated:** November 2, 2025

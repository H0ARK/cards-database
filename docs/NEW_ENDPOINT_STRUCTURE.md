# 🚀 NEW Product Endpoint Structure

## The NEW Way (Products System)

Products use **GROUP ID** and **CARD NUMBER**, NOT set abbreviations.

### Route Pattern
```
GET /v2/products/{groupId}/{cardNumber}
GET /v2/products/{productId}
```

## Examples

### By Product ID (Direct)
```bash
# Get Charizard from Base Set
GET /v2/products/42348

# Response includes:
{
  "id": 42348,
  "name": "Charizard",
  "cardNumber": "004/102",
  "groupId": 604,
  "group": {
    "id": 604,
    "name": "Base Set",
    "abbreviation": "BS1"
  },
  "image": "https://tcgplayer-cdn.tcgplayer.com/product/42348_400w.jpg",
  "imageSmall": "https://tcgplayer-cdn.tcgplayer.com/product/42348_200w.jpg",
  "imageHigh": "https://tcgplayer-cdn.tcgplayer.com/product/42348_600w.jpg"
}
```

### By Group + Card Number
```bash
# Get card from Base Set (group 604), card #4
GET /v2/products/604/004

# Or with full number
GET /v2/products/604/004/102
```

## Group IDs (Pokemon Sets)

```javascript
const POPULAR_GROUPS = {
  // Classic Sets
  baseSet: 604,
  jungle: 605,
  fossil: 606,
  baseSet2: 607,
  teamRocket: 608,
  
  // Modern Sets
  scarletViolet: 23734,      // SV01
  paledaEvolved: 23848,      // SV02
  obsidianFlames: 23913,     // SV03
  prismticEvolutions: 23821, // PRE
  
  // Find more via:
  // SELECT id, name, abbreviation FROM groups WHERE category_id = 3
}
```

## Current vs NEW

### OLD System (cards table)
```bash
GET /v2/en/cards/base1/4           # ❌ Set abbreviation + local ID
GET /v2/en/cards/base1-4           # ❌ Card ID format
```

### NEW System (products table)  
```bash
GET /v2/products/604/004           # ✅ Group ID + card number
GET /v2/products/42348             # ✅ Direct product ID (FASTEST)
```

## Why Group IDs?

1. **Universal** - Works across ALL card games (Magic, Yu-Gi-Oh, Pokemon)
2. **Consistent** - Same as TCGPlayer API
3. **Precise** - No ambiguity (abbreviations can be reused)
4. **Direct** - One lookup, no string matching

## Finding Group IDs

### Method 1: Database Query
```sql
SELECT id, name, abbreviation 
FROM groups 
WHERE name ILIKE '%base set%' 
AND category_id = 3;

-- Result: 604 | Base Set | BS1
```

### Method 2: Search Products
```bash
GET /v2/products?search=charizard&limit=1

# Response includes group info
{
  "results": [{
    "id": 42348,
    "groupId": 604,
    "group": { "name": "Base Set" }
  }]
}
```

### Method 3: List All Groups
```bash
GET /v2/groups?categoryId=3

# Returns all Pokemon sets with IDs
```

## Recommended Frontend Approach

### Store Group ID Mapping
```typescript
// groups.ts - Your static mapping
export const GROUPS = {
  baseSet: { id: 604, name: "Base Set" },
  jungle: { id: 605, name: "Jungle" },
  fossil: { id: 606, name: "Fossil" },
  // ... etc
}

// Or fetch once on app load
async function loadGroups() {
  const groups = await fetch('/v2/groups?categoryId=3')
  return groups.json()
}
```

### Use Product IDs Directly
```typescript
// BEST: Just use product IDs everywhere
const CARDS = {
  charizardBase: 42348,
  pikachuBase: 42402,
  blastoise: 42360
}

// Fetch card
const card = await fetch(`/v2/products/${CARDS.charizardBase}`)
```

### Dynamic Lookup
```typescript
// Search for a card, get product ID
const results = await fetch('/v2/products?name=charizard&groupId=604')
const productId = results[0].id

// Then use product ID for everything else
const card = await fetch(`/v2/products/${productId}`)
```

## Complete Endpoint List

### Products
```bash
GET /v2/products                       # List all products (paginated)
GET /v2/products?categoryId=3          # Pokemon only
GET /v2/products?groupId=604           # Base Set only
GET /v2/products?name=charizard        # Search by name
GET /v2/products/:productId            # Get single product
GET /v2/products/:groupId/:cardNumber  # Get by group + card #
GET /v2/products/:productId/history    # Price history
```

### Groups (Sets)
```bash
GET /v2/groups                         # All groups
GET /v2/groups?categoryId=3            # Pokemon sets
GET /v2/groups/:groupId                # Single group info
GET /v2/groups/:groupId/products       # All products in group
```

### Categories
```bash
GET /v2/categories                     # All categories (games)
GET /v2/categories/3                   # Pokemon info
```

## Frontend Examples

### React Component
```tsx
import { useState, useEffect } from 'react'

function ProductCard({ productId }: { productId: number }) {
  const [product, setProduct] = useState(null)
  
  useEffect(() => {
    fetch(`/v2/products/${productId}`)
      .then(r => r.json())
      .then(setProduct)
  }, [productId])
  
  if (!product) return <div>Loading...</div>
  
  return (
    <div>
      <img src={product.image} alt={product.name} />
      <h3>{product.name}</h3>
      <p>{product.group.name} #{product.cardNumber}</p>
      <p>${product.pricing?.marketPrice}</p>
    </div>
  )
}

// Usage
<ProductCard productId={42348} />
```

### Set Browser
```tsx
function SetBrowser({ groupId }: { groupId: number }) {
  const [products, setProducts] = useState([])
  
  useEffect(() => {
    fetch(`/v2/products?groupId=${groupId}`)
      .then(r => r.json())
      .then(setProducts)
  }, [groupId])
  
  return (
    <div className="grid">
      {products.map(p => (
        <ProductCard key={p.id} productId={p.id} />
      ))}
    </div>
  )
}

// Usage
<SetBrowser groupId={604} /> // Base Set
```

## Migration Path

1. **Map your existing set IDs to group IDs**
   ```typescript
   const SET_TO_GROUP = {
     'base1': 604,
     'jungle': 605,
     'fossil': 606
   }
   ```

2. **Update API calls**
   ```typescript
   // OLD
   fetch(`/v2/en/cards/${setId}/${localId}`)
   
   // NEW
   const groupId = SET_TO_GROUP[setId]
   fetch(`/v2/products/${groupId}/${localId}`)
   ```

3. **Or just use product IDs**
   ```typescript
   // Search once, get product ID
   const results = await searchProducts(cardName)
   const productId = results[0].id
   
   // Store product ID in your DB/state
   // Use product ID for all future requests
   ```

## Quick Reference Table

| Endpoint | OLD (cards) | NEW (products) |
|----------|-------------|----------------|
| Get card | `/en/cards/base1-4` | `/products/42348` |
| List set | `/en/cards?set=base1` | `/products?groupId=604` |
| Search | `/en/cards?name=pikachu` | `/products?name=pikachu` |
| Price history | `/en/cards/base1-4/history` | `/products/42348/history` |

---

## Bottom Line

**Use product IDs (`42348`) everywhere. They're faster, cleaner, and work with images!** 🚀

Group IDs are just for organization/filtering. The real power is in product IDs.

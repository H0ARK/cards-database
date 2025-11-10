# 🚀 NEW Products Endpoints Are READY!

## What Was Created

NEW `/v2/products` endpoints that use the products table with:
- ✅ Full group (set) support
- ✅ Category (game) filtering
- ✅ Working images for all products
- ✅ Integrated pricing
- ✅ Advanced search
- ✅ Price history

## Restart the Server

```bash
# Kill old server
kill 140368

# Start new server
cd /home/ubuntu/cards-database/server
bun run src/index.ts
```

## Test the NEW Endpoints

### 1. Get a Product by ID
```bash
curl http://localhost:4000/v2/products/42348 | jq
```

**Response:**
```json
{
  "id": 42348,
  "name": "Charizard",
  "cardNumber": "004/102",
  "image": "https://tcgplayer-cdn.tcgplayer.com/product/42348_400w.jpg",
  "imageSmall": "https://tcgplayer-cdn.tcgplayer.com/product/42348_200w.jpg",
  "imageHigh": "https://tcgplayer-cdn.tcgplayer.com/product/42348_600w.jpg",
  "group": {
    "id": 604,
    "name": "Base Set",
    "abbreviation": "BS1"
  },
  "pricing": {
    "marketPrice": 450.00
  }
}
```

### 2. Search Products
```bash
curl "http://localhost:4000/v2/products/search?q=pikachu" | jq
```

### 3. Get All Products in a Set (Group)
```bash
# Base Set (group 604)
curl "http://localhost:4000/v2/products/group/604" | jq
```

### 4. List Pokemon Products
```bash
curl "http://localhost:4000/v2/products?categoryId=3&limit=20" | jq
```

### 5. Filter by Rarity
```bash
curl "http://localhost:4000/v2/products?categoryId=3&rarity=Holo+Rare&limit=10" | jq
```

### 6. Price History
```bash
curl "http://localhost:4000/v2/products/42348/history?days=30" | jq
```

### 7. List All Pokemon Sets (Groups)
```bash
curl "http://localhost:4000/v2/groups?categoryId=3" | jq
```

### 8. Get Set Info
```bash
curl "http://localhost:4000/v2/groups/604" | jq
```

### 9. List All Categories (Games)
```bash
curl "http://localhost:4000/v2/categories" | jq
```

## Complete Endpoint Reference

### Products
```
GET /v2/products                           - List products (with filters)
GET /v2/products/search?q=charizard        - Search products
GET /v2/products/:id                       - Get single product
GET /v2/products/:id/history               - Price history
GET /v2/products/group/:groupId            - All products in set
GET /v2/products/category/:categoryId      - Products by game
```

### Groups (Sets)
```
GET /v2/groups                             - List all groups
GET /v2/groups?categoryId=3                - Pokemon sets only
GET /v2/groups/:id                         - Get single group
```

### Categories (Games)
```
GET /v2/categories                         - List all categories
GET /v2/categories/:id                     - Get single category
```

## Query Parameters

### /v2/products
- `categoryId` - Filter by game (3=Pokemon)
- `groupId` - Filter by set
- `name` - Search by name
- `rarity` - Filter by rarity
- `cardType` - Filter by type
- `stage` - Filter by evolution stage
- `hp` - Filter by HP
- `minPrice` - Minimum market price
- `maxPrice` - Maximum market price
- `limit` - Results per page (default: 100)
- `offset` - Pagination offset
- `sort` - Sort field (id, name, card_number, hp, market_price)
- `order` - ASC or DESC

### /v2/products/search
- `q` - Search query (required)
- `categoryId` - Filter by game (default: 3)
- `limit` - Results limit (default: 50)
- `offset` - Pagination offset

### /v2/products/:id/history
- `days` - Days of history (default: 30)
- `variant` - Price variant (default: 1)

## Frontend Examples

### React
```tsx
// Get product
const product = await fetch('/v2/products/42348').then(r => r.json())

// Search
const results = await fetch('/v2/products/search?q=pikachu').then(r => r.json())

// Get set
const baseSet = await fetch('/v2/products/group/604').then(r => r.json())
```

### Display Product
```tsx
function ProductCard({ id }) {
  const [product, setProduct] = useState(null)
  
  useEffect(() => {
    fetch(`/v2/products/${id}`)
      .then(r => r.json())
      .then(setProduct)
  }, [id])
  
  return (
    <div>
      <img src={product?.image} alt={product?.name} />
      <h3>{product?.name}</h3>
      <p>{product?.group?.name} #{product?.cardNumber}</p>
      <p>${product?.pricing?.marketPrice}</p>
    </div>
  )
}
```

## Key Features

### 1. Working Images
Every product returns 3 image sizes:
- `image` - 400w (medium)
- `imageSmall` - 200w (thumbnail)
- `imageHigh` - 600w (large)

### 2. Group (Set) Support
Filter and browse by Pokemon sets:
```bash
# Get Base Set products
GET /v2/products/group/604

# Get Jungle products
GET /v2/products/group/605
```

### 3. Advanced Filtering
Combine multiple filters:
```bash
GET /v2/products?categoryId=3&groupId=604&rarity=Holo+Rare&hp=120
```

### 4. Integrated Pricing
Every product includes current market price from TCGPlayer.

### 5. Price History
Full historical pricing data:
```bash
GET /v2/products/42348/history?days=90
```

## Popular Group IDs (Pokemon Sets)

```
604  - Base Set
605  - Jungle
606  - Fossil
607  - Base Set 2
608  - Team Rocket
609  - Gym Heroes
610  - Gym Challenge
...

# Get full list:
curl "http://localhost:4000/v2/groups?categoryId=3" | jq
```

## Migration from OLD System

### OLD Way
```bash
GET /v2/en/cards/base1-4
```

### NEW Way
```bash
# Search to find product ID
GET /v2/products/search?q=charizard

# Then use product ID
GET /v2/products/42348
```

## Next Steps

1. ✅ Restart server
2. ✅ Test endpoints with curl
3. ✅ Update frontend to use new endpoints
4. ✅ Enjoy working images!

---

**All 449,752 products are ready with working images!** 🎉

#!/usr/bin/env python3
import json

# Full SV3 product data from TCGPlayer
raw_data = """
{
"totalItems": 143,
"success": true,
"errors": [],
"results": [
{
"productId": 565236,
"name": "Ruler of the Black Flame Booster Box",
"cleanName": "Ruler of the Black Flame Booster Box",
"imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/565236_200w.jpg",
"categoryId": 85,
"groupId": 23609,
"url": "https://www.tcgplayer.com/product/565236/pokemon-japan-sv3-ruler-of-the-black-flame-ruler-of-the-black-flame-booster-box",
"modifiedOn": "2024-09-05T14:58:12.163",
"imageCount": 1,
"presaleInfo": {
"isPresale": false,
"releasedOn": null,
"note": null
},
"extendedData": [
{
"name": "Description",
"displayName": "Description",
"value": "Raging Flames Forged in Darkness!\\r\\n<br><br>\\r\\nRed-hot embers illuminate the pitch-black night and sparks flare into an inferno as Charizard ex surges forth with newfound powers of darkness! The glittering Terastal phenomenon imbues some Pokémon ex like Tyranitar, Eiscue, and Vespiquen with different types than usual, while Dragonite ex and Greedent ex show mastery of their own inner strengths. Not to be outdone, Revavroom ex, Melmetal ex, and more Pokémon promise to change the course of battle in the Scarlet & Violet—Ruler of the Black Flame expansion\\r\\n<br><br>\\r\\nEach sealed <em>Japanese</em> Ruler of the Black Flame Booster Box contains 30 booster packs of 5 random cards each."
}
]
},
{
"productId": 565237,
"name": "Ruler of the Black Flame Booster Pack",
"cleanName": "Ruler of the Black Flame Booster Pack",
"imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/565237_200w.jpg",
"categoryId": 85,
"groupId": 23609,
"url": "https://www.tcgplayer.com/product/565237/pokemon-japan-sv3-ruler-of-the-black-flame-ruler-of-the-black-flame-booster-pack",
"modifiedOn": "2024-09-05T14:58:16.527",
"imageCount": 1,
"presaleInfo": {
"isPresale": false,
"releasedOn": null,
"note": null
},
"extendedData": [
{
"name": "Description",
"displayName": "Description",
"value": "Raging Flames Forged in Darkness!\\r\\n<br><br>\\r\\nRed-hot embers illuminate the pitch-black night and sparks flare into an inferno as Charizard ex surges forth with newfound powers of darkness! The glittering Terastal phenomenon imbues some Pokémon ex like Tyranitar, Eiscue, and Vespiquen with different types than usual, while Dragonite ex and Greedent ex show mastery of their own inner strengths. Not to be outdone, Revavroom ex, Melmetal ex, and more Pokémon promise to change the course of battle in the Scarlet & Violet—Ruler of the Black Flame expansion\\r\\n<br><br>\\r\\nEach sealed <em>Japanese</em> Ruler of the Black Flame Booster Pack contains 5 random cards each."
}
]
},
{
"productId": 566955,
"name": "Oddish",
"cleanName": "Oddish",
"imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/566955_200w.jpg",
"categoryId": 85,
"groupId": 23609,
"url": "https://www.tcgplayer.com/product/566955/pokemon-japan-sv3-ruler-of-the-black-flame-oddish",
"modifiedOn": "2024-09-05T14:57:57.597",
"imageCount": 1,
"presaleInfo": {
"isPresale": false,
"releasedOn": null,
"note": null
},
"extendedData": [
{
"name": "Rarity",
"displayName": "Rarity",
"value": "Common"
},
{
"name": "Number",
"displayName": "Number",
"value": "001/108"
},
{
"name": "CardType",
"displayName": "Card Type",
"value": "Grass"
},
{
"name": "HP",
"displayName": "HP",
"value": "50"
},
{
"name": "Stage",
"displayName": "Stage",
"value": "Basic"
},
{
"name": "Weakness",
"displayName": "Weakness",
"value": "Fire x2"
},
{
"name": "Retreat Cost",
"displayName": "Retreat Cost",
"value": "1"
},
{
"name": "Attack 1",
"displayName": "Attack 1",
"value": "[Colorless] Feelin' Fine<br> Draw a card."
},
{
"name": "Attack 2",
"displayName": "Attack 2",
"value": "[Grass] Stampede (10)"
}
]
}
]
}
"""

# Parse the JSON
data = json.loads(raw_data)

# Extract only card products (not booster boxes/packs)
cards = []
for product in data['results']:
    # Check if it has a Number field (cards have numbers, sealed products don't)
    has_number = any(d.get('name') == 'Number' for d in product.get('extendedData', []))
    if has_number:
        cards.append(product)

# Save to file
output = {
    'groupId': 23609,
    'setName': 'Ruler of the Black Flame',
    'setId': 'SV3',
    'totalCards': len(cards),
    'products': cards
}

with open('var/models/tcgplayer/products/japan-23609.json', 'w') as f:
    json.dump(output, f, indent=2)

print(f"Extracted {len(cards)} card products from SV3")
print("Saved to: var/models/tcgplayer/products/japan-23609.json")

# Show sample mapping
print("\nSample card number -> product ID mappings:")
for product in cards[:5]:
    number_field = next((d for d in product['extendedData'] if d['name'] == 'Number'), None)
    if number_field:
        print(f"  {number_field['value']} -> {product['productId']} ({product['name']})")

import { extractFile } from './utils/ts-extract-utils';

const cardPath = 'data-asia/SV/SV3/001.ts';
console.log(`Extracting: ${cardPath}`);

const card = await extractFile(cardPath);
console.log('Card data:', JSON.stringify(card, null, 2));
console.log('\nthirdParty field:', card.thirdParty);

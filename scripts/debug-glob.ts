import { glob } from 'glob';

console.log('Testing glob patterns...\n');

const pattern1 = await glob('data/**/*.ts', {
  cwd: process.cwd(),
  ignore: ['data/**/index.ts', 'data/**/*.ts', 'data/*/index.ts']
});
console.log(`Pattern 1 (data/**/*.ts with ignores): ${pattern1.length}`);

const pattern2 = await glob('data-asia/**/*.ts', {
  cwd: process.cwd(),
  ignore: ['data-asia/**/index.ts', 'data-asia/**/*.ts', 'data-asia/*/index.ts']
});
console.log(`Pattern 2 (data-asia/**/*.ts with ignores): ${pattern2.length}`);

const pattern3 = await glob('data-asia/**/*.ts', {
  cwd: process.cwd(),
  ignore: ['**/index.ts']
});
console.log(`Pattern 3 (data-asia/**/*.ts, ignore index.ts): ${pattern3.length}`);

const sv3Only = pattern3.filter(f => f.includes('SV3/'));
console.log(`SV3 files from pattern 3: ${sv3Only.length}`);
sv3Only.slice(0, 3).forEach(f => console.log(`  ${f}`));

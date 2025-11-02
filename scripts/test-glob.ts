import { glob } from 'glob';

const files = await glob('data-asia/**/*.ts', {
  cwd: process.cwd(),
  ignore: ['data-asia/**/index.ts', 'data-asia/*/index.ts']
});

console.log(`Found ${files.length} files`);
console.log('First 10:');
files.slice(0, 10).forEach(f => console.log(`  ${f}`));

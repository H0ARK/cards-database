import { glob } from 'glob';
import path from 'path';

const files = await glob('data-asia/**/*.ts', {
  cwd: process.cwd(),
  ignore: ['data-asia/**/index.ts', 'data-asia/*/index.ts']
});

const sv3Files = files.filter(f => f.includes('SV3/'));
console.log(`SV3 files: ${sv3Files.length}`);
sv3Files.slice(0, 5).forEach(f => {
  const filename = path.basename(f, '.ts');
  const parentDir = path.dirname(f);
  const parts = parentDir.split(path.sep);
  const isNumeric = /^\d+/.test(filename);
  console.log(`  ${f} - parts: ${parts.length}, numeric: ${isNumeric}`);
});

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, 'public');
const staticFiles = [
  'index.html',
  'style.css',
  'script.js',
  '404.html',
  '_headers',
  '_redirects',
  '.nojekyll'
];

fs.mkdirSync(outputDir, { recursive: true });

for (const fileName of staticFiles) {
  const source = path.join(root, fileName);
  if (!fs.existsSync(source)) continue;
  fs.copyFileSync(source, path.join(outputDir, fileName));
}

console.log(`Static site ready in ${path.relative(root, outputDir) || outputDir}`);

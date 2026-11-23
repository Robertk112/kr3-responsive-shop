import { readFile, readdir, stat } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const pagesBase = new URL('https://example.test/kr3-responsive-shop/');
const pages = (await readdir(root)).filter((name) => name.endsWith('.html'));

async function checkReference(reference, source) {
  const resolved = new URL(reference, new URL(source, pagesBase));
  if (resolved.origin !== pagesBase.origin) return;
  assert.ok(resolved.pathname.startsWith(pagesBase.pathname), source + ': ' + reference);
  const localPath = resolved.pathname.slice(pagesBase.pathname.length) || 'index.html';
  const file = new URL(localPath, root);
  assert.ok((await stat(file)).isFile(), source + ': ' + reference);
  if (resolved.hash && localPath.endsWith('.html')) {
    const html = await readFile(file, 'utf8');
    assert.ok(html.includes('id="' + decodeURIComponent(resolved.hash.slice(1)) + '"'),
      source + ': ' + reference);
  }
}

for (const page of pages) {
  test(page + ' works under the project prefix', async () => {
    const html = await readFile(new URL(page, root), 'utf8');
    for (const [, reference] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      await checkReference(reference, page);
    }
    for (const [, srcset] of html.matchAll(/\bsrcset="([^"]+)"/g)) {
      for (const candidate of srcset.split(',')) {
        await checkReference(candidate.trim().split(/\s+/)[0], page);
      }
    }
  });
}

test('published catalog references resolve under the project prefix', async () => {
  const products = JSON.parse(await readFile(new URL('api/products.json', root), 'utf8'));
  assert.ok(products.length > 0);
  assert.equal(new Set(products.map(({ id }) => id)).size, products.length);
  for (const { image, href } of products) {
    await checkReference(image, 'catalog.html');
    if (href) await checkReference(href, 'catalog.html');
  }
});

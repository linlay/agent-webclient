import { describe, expect, it } from 'vitest';

import { renderMarkdown, rewriteImageSrc } from './markdownRenderer.js';

describe('markdownRenderer', () => {
  it('rewrites /data image path through /api/ap/data with encoding', () => {
    expect(rewriteImageSrc('/data/sample_photo.jpg')).toBe('/api/ap/data?file=%2Fdata%2Fsample_photo.jpg');
  });

  it('encodes spaces when rewriting relative image path', () => {
    expect(rewriteImageSrc('./a b.jpg')).toBe('/api/ap/data?file=.%2Fa%20b.jpg');
  });

  it('keeps https image url unchanged', () => {
    const url = 'https://example.com/a.jpg';
    expect(rewriteImageSrc(url)).toBe(url);
  });

  it('rewrites non-http(s) image paths through /api/ap/data', () => {
    expect(rewriteImageSrc('/api/data/sample_photo.jpg')).toBe('/api/ap/data?file=%2Fapi%2Fdata%2Fsample_photo.jpg');
    expect(rewriteImageSrc('/image/sample_photo.jpg')).toBe('/api/ap/data?file=%2Fimage%2Fsample_photo.jpg');
  });

  it('renders markdown image with rewritten src', () => {
    const html = renderMarkdown('![示例](/data/sample_photo.jpg)');
    expect(html).toContain('<img');
    expect(html).toContain('data-auth-src="/api/ap/data?file=%2Fdata%2Fsample_photo.jpg"');
  });

  it('renders https image directly via src', () => {
    const html = renderMarkdown('![示例](https://example.com/a.jpg)');
    expect(html).toContain('src="https://example.com/a.jpg"');
  });

  it('does not passthrough raw html', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
});

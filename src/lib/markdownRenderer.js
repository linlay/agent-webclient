import { Marked, Renderer } from 'marked';

function escapeHtml(input) {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(input) {
  return escapeHtml(input).replaceAll('`', '&#96;');
}

function sanitizeLinkHref(href) {
  const value = String(href ?? '').trim();
  if (!value) {
    return '';
  }

  if (/^(?:javascript|vbscript|data):/i.test(value)) {
    return '';
  }

  return value;
}

export function rewriteImageSrc(src) {
  const value = String(src ?? '').trim();
  if (!value) {
    return '';
  }

  if (/^https?:/i.test(value)) {
    return value;
  }

  return `/api/ap/data?file=${encodeURIComponent(value)}`;
}

const renderer = new Renderer();

renderer.html = (token) => {
  return escapeHtml(token?.text || '');
};

renderer.image = function image(token) {
  const rawHref = String(token?.href || '').trim();
  const src = rewriteImageSrc(rawHref);
  const alt = escapeAttribute(token?.text || '');
  const title = token?.title ? ` title="${escapeAttribute(token.title)}"` : '';
  const isHttpImage = /^https?:/i.test(rawHref);

  if (!src) {
    return `<span>${escapeHtml(token?.raw || '')}</span>`;
  }

  if (!isHttpImage) {
    return `<img data-auth-src="${escapeAttribute(src)}" alt="${alt}"${title}>`;
  }

  return `<img src="${escapeAttribute(src)}" alt="${alt}"${title}>`;
};

renderer.link = function link(token) {
  const href = sanitizeLinkHref(token?.href || '');
  const body = this.parser.parseInline(token?.tokens || []);
  const title = token?.title ? ` title="${escapeAttribute(token.title)}"` : '';

  if (!href) {
    return body;
  }

  return `<a href="${escapeAttribute(href)}"${title}>${body}</a>`;
};

const markdown = new Marked({
  async: false,
  breaks: true,
  gfm: true,
  renderer
});

export function renderMarkdown(text) {
  const source = String(text ?? '');
  if (!source.trim()) {
    return '';
  }

  try {
    return String(markdown.parse(source));
  } catch (_error) {
    return `<p>${escapeHtml(source)}</p>`;
  }
}

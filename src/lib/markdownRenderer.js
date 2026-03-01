import { Marked, Renderer } from 'marked';
import katex from 'katex';

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

function renderMathMarkup(formula, { displayMode = false, raw = '' } = {}) {
  const source = String(formula ?? '').trim();
  if (!source) {
    return `<span>${escapeHtml(raw || '')}</span>`;
  }

  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: 'ignore'
    });
  } catch (_error) {
    return `<span>${escapeHtml(raw || source)}</span>`;
  }
}

const mathBlockExtension = {
  name: 'mathBlock',
  level: 'block',
  start(src) {
    const index = src.search(/\$\$|\\\[/);
    return index >= 0 ? index : undefined;
  },
  tokenizer(src) {
    const dollarMatch = /^\$\$([\s\S]+?)\$\$(?:\n{1,}|$)/.exec(src);
    if (dollarMatch) {
      return {
        type: 'mathBlock',
        raw: dollarMatch[0],
        text: dollarMatch[1]
      };
    }

    const bracketMatch = /^\\\[([\s\S]+?)\\\](?:\n{1,}|$)/.exec(src);
    if (bracketMatch) {
      return {
        type: 'mathBlock',
        raw: bracketMatch[0],
        text: bracketMatch[1]
      };
    }

    return undefined;
  },
  renderer(token) {
    return `${renderMathMarkup(token?.text, { displayMode: true, raw: token?.raw })}\n`;
  }
};

const mathInlineExtension = {
  name: 'mathInline',
  level: 'inline',
  start(src) {
    const index = src.search(/\$|\\\(/);
    return index >= 0 ? index : undefined;
  },
  tokenizer(src) {
    const parenMatch = /^\\\(([\s\S]+?)\\\)/.exec(src);
    if (parenMatch) {
      return {
        type: 'mathInline',
        raw: parenMatch[0],
        text: parenMatch[1]
      };
    }

    const dollarMatch = /^\$(?!\$)((?:\\.|[^\n\\$])+?)\$(?!\$)/.exec(src);
    if (dollarMatch) {
      return {
        type: 'mathInline',
        raw: dollarMatch[0],
        text: dollarMatch[1]
      };
    }

    return undefined;
  },
  renderer(token) {
    return renderMathMarkup(token?.text, { displayMode: false, raw: token?.raw });
  }
};

const markdown = new Marked({
  async: false,
  breaks: true,
  gfm: true,
  renderer
});

markdown.use({
  extensions: [mathBlockExtension, mathInlineExtension]
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

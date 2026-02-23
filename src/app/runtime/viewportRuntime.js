export function createViewportRuntime(ctx) {
  const { state, elements, services } = ctx;

  async function renderViewportBlock(block, runId) {
    const signature = `${block.key}::${block.payloadRaw}`;
    if (state.renderedViewportSignatures.has(signature)) {
      return;
    }
    state.renderedViewportSignatures.add(signature);

    const card = document.createElement('article');
    card.className = 'viewport-card';

    const head = document.createElement('div');
    head.className = 'viewport-head';
    head.textContent = `key=${block.key}`;

    const body = document.createElement('div');
    body.className = 'status-line';
    body.textContent = 'loading viewport...';

    card.append(head, body);
    elements.viewportList.prepend(card);

    try {
      const response = await services.getViewport(block.key);
      const html = response.data?.html;

      if (typeof html !== 'string' || !html.trim()) {
        throw new Error('Viewport response does not contain html');
      }

      const iframe = document.createElement('iframe');
      iframe.className = 'viewport-frame';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.srcdoc = html;

      body.replaceWith(iframe);

      iframe.addEventListener('load', () => {
        try {
          iframe.contentWindow?.postMessage(block.payload ?? services.safeJsonParse(block.payloadRaw, {}), '*');
        } catch (error) {
          ctx.ui.appendDebug(`viewport postMessage failed: ${error.message}`);
        }
      });
    } catch (error) {
      body.textContent = `viewport failed: ${error.message}`;
      body.style.color = 'var(--danger)';
    }
  }

  async function loadViewportIntoContentNode(nodeId, signature, runId) {
    const node = state.timelineNodes.get(nodeId);
    if (!node || node.kind !== 'content') {
      return;
    }

    const viewport = node.embeddedViewports?.[signature];
    if (!viewport || !viewport.key) {
      return;
    }

    const requestRunId = String(runId || '');
    if (viewport.loadStarted) {
      return;
    }

    if (viewport.html && viewport.lastLoadRunId === requestRunId) {
      return;
    }

    viewport.loadStarted = true;
    viewport.lastLoadRunId = requestRunId;
    viewport.loading = true;
    viewport.error = '';
    ctx.ui.renderMessages({ nodeId, stickToBottom: false });

    try {
      const response = await services.getViewport(viewport.key);
      const html = response.data?.html;
      if (typeof html !== 'string' || !html.trim()) {
        throw new Error('Viewport response does not contain html');
      }

      viewport.html = html;
      viewport.loading = false;
      viewport.error = '';
    } catch (error) {
      viewport.loading = false;
      viewport.error = `viewport failed: ${error.message}`;
    } finally {
      viewport.loadStarted = false;
      ctx.ui.renderMessages({ nodeId, stickToBottom: false });
    }
  }

  function processViewportBlocks(contentId, text, runId, ts) {
    const nodeId = state.contentNodeById.get(contentId);
    if (!nodeId) {
      return;
    }

    const node = state.timelineNodes.get(nodeId);
    if (!node || node.kind !== 'content') {
      return;
    }

    const segments = services.parseContentSegments(contentId, text);
    node.segments = segments;
    if (!node.embeddedViewports || typeof node.embeddedViewports !== 'object') {
      node.embeddedViewports = {};
    }

    const activeSignatures = new Set();
    for (const segment of segments) {
      if (segment.kind !== 'viewport') {
        continue;
      }

      const signature = segment.signature;
      activeSignatures.add(signature);

      const existing = node.embeddedViewports[signature] || {
        signature,
        key: segment.key,
        payload: segment.payload,
        payloadRaw: segment.payloadRaw,
        html: '',
        loading: false,
        error: '',
        loadStarted: false,
        lastLoadRunId: ''
      };

      existing.key = segment.key;
      existing.payload = segment.payload;
      existing.payloadRaw = segment.payloadRaw;
      existing.ts = ts ?? Date.now();
      node.embeddedViewports[signature] = existing;

      loadViewportIntoContentNode(nodeId, signature, runId).catch((error) => {
        ctx.ui.appendDebug(`viewport embed load failed: ${error.message}`);
      });

      renderViewportBlock(
        {
          key: existing.key,
          payload: existing.payload,
          payloadRaw: existing.payloadRaw
        },
        runId
      ).catch((error) => {
        ctx.ui.appendDebug(`viewport debug render failed: ${error.message}`);
      });
    }

    for (const signature of Object.keys(node.embeddedViewports)) {
      if (!activeSignatures.has(signature)) {
        delete node.embeddedViewports[signature];
      }
    }

    node.ts = ts ?? node.ts;
  }

  return {
    processViewportBlocks,
    renderViewportBlock,
    loadViewportIntoContentNode
  };
}

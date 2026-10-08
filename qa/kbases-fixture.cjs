// Stateful, disposable data for collection editing and large-library visual QA.
module.exports = function createKBasesFixture() {
  const groups = ['guides', 'api', 'tutorials', 'architecture', 'releases', 'operations', 'security', 'examples', 'research', 'reference'];
  let items = [{ id: 'product-docs', name: 'Product documentation', description: 'Guides, API references and operational notes for the product team.', collections: groups.map(name => ({ name, sourcePath: `/demo/knowledge/${name}` })), state: 'ready', createdAt: 1789027200000, updatedAt: 1789027200000, indexedAt: 1789027200000 }, { id: 'team-notes', name: 'Team notes', description: 'Meeting notes and decisions.', collections: [{ name: 'notes', sourcePath: '/demo/knowledge/notes' }], state: 'unindexed', createdAt: 1789027200000, updatedAt: 1789027200000, indexedAt: 0 }];
  const documents = item => item.collections.flatMap(c => ['getting-started.md', 'configuration.md', 'troubleshooting.md'].map((name, index) => ({ file: `kbx://${c.name}/${name}`, collection: c.name, relativePath: name, title: name.replace('.md', ''), bytes: 2048 + index * 1024 })));
  return (req, res) => {
    const [id, operation] = req.path.split('/').filter(Boolean);
    const reply = data => res.json({ code: 0, msg: '', data });
    if (!id) {
      if (req.method === 'POST') {
        const item = { ...req.body, id: `fixture-${items.length}`, state: 'unindexed', indexedAt: 0, createdAt: Date.now(), updatedAt: Date.now() };
        items.unshift(item); return reply(item);
      }
      return reply(items);
    }
    let item = items.find(item => item.id === id);
    if (!item) return res.status(404).json({ code: 404, msg: 'Knowledge base not found' });
    if (!operation && req.method === 'PUT') {
      const changed = JSON.stringify(item.collections) !== JSON.stringify(req.body.collections);
      Object.assign(item, req.body, { updatedAt: Date.now(), ...(changed ? { state: 'unindexed', indexedAt: 0 } : {}) });
      return reply(item);
    }
    if (!operation && req.method === 'DELETE') { items = items.filter(item => item.id !== id); return reply({}); }
    if (operation === 'refresh') { Object.assign(item, { state: 'ready', indexedAt: Date.now() }); return reply(item); }
    if (operation === 'files') return reply({ documents: documents(item), complete: true });
    if (operation === 'status') return reply({ capabilities: { fullText: { available: true }, vector: { complete: true, queryModelConfigured: true }, graph: { complete: false } } });
    if (operation === 'search') return reply({ results: documents(item).filter(doc => !req.body.collections?.length || req.body.collections.includes(doc.collection)).slice(0, req.body.limit || 10).map((doc, index) => ({ ...doc, resultId: `hit-${index}`, score: 0.84 - index * 0.015, scoreType: 'vector_similarity', chunk: { id: `chunk-${index}`, seq: 0 }, evidence: { id: `evidence-${index}`, text: 'Configure the workspace, connect your sources, and update the index to make documents available for retrieval.', range: { lineStart: 12, lineEnd: 14 } } })), trace: { degraded: false, coverage: { retrievalUsed: ['fts', 'vector'] } } });
    if (operation === 'read') return reply({ file: req.query.ref, body: '# Getting started\n\nConfigure the workspace and connect your source directories.\n\nUpdate the index after changing your documents.', readRange: { hasMore: false } });
    return reply(item);
  };
};

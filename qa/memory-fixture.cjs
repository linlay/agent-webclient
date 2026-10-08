// Disposable memory documents and jobs for management-page interaction checks.
module.exports = function createMemoryFixture() {
  const today = '2026-10-08';
  const files = new Map([
    ['memory', '# Long-term memory\n\n## Collaboration\n\n- Keep interfaces consistent with the Agents and Skills pages.\n- Prefer concise explanations and concrete results.\n\n## Project conventions\n\n- Use npm for dependency management.\n- Keep domain logic in feature modules.\n- Verify changes in light and dark themes.'],
    ['owner', '# Identity & preferences\n\n- Respond in Chinese.\n- Keep communication clear and concise.'],
    ...Array.from({ length: 16 }, (_, i) => [`daily:${new Date(Date.UTC(2026, 9, 8 - i)).toISOString().slice(0, 10)}`, `# Daily notes\n\n- Reviewed the management interface.\n- Updated the memory workspace.`]),
  ]);
  let revision = 1;
  let manual;
  const status = () => ({ enabled: true, automatic: true, pollIntervalSeconds: 300, modelKey: 'configured-model', timezone: 'Asia/Shanghai', state: 'idle', processedBatches: 12, manual });
  const key = (kind, date) => kind === 'daily' ? `daily:${date}` : kind;
  const document = (kind, date) => ({ kind, ...(kind === 'daily' ? { date } : {}), content: files.get(key(kind, date)) || '', revision: `r${revision}`, exists: files.has(key(kind, date)) });
  return (req, res) => {
    const reply = data => res.json({ code: 0, msg: '', data });
    if (req.path === '/file') {
      if (req.method === 'GET') return reply(document(req.query.kind, req.query.date));
      const { kind, date, content } = req.body;
      if (req.method === 'DELETE') files.delete(key(kind, date));
      else files.set(key(kind, date), content);
      revision++;
      return reply(document(kind, date));
    }
    if (req.path === '/daily') return reply({ dates: [...files.keys()].filter(k => k.startsWith('daily:')).map(k => k.slice(6)).sort().reverse(), today, nextBefore: '' });
    if (req.path === '/search') {
      const matches = [...files.entries()].flatMap(([k, body]) => body.split('\n').flatMap((text, i) => text.toLowerCase().includes(String(req.query.query).toLowerCase()) ? [{ kind: k.startsWith('daily:') ? 'daily' : k, ...(k.startsWith('daily:') ? { date: k.slice(6) } : {}), line: i + 1, text }] : []));
      return reply({ matches: matches.slice(0, 40), nextBefore: '', maxMatches: 40, searchedDailyFiles: 16 });
    }
    if (req.path === '/status') {
      if (manual?.state === 'queued' && Date.now() - manual.startedAt > 3000) manual = { ...manual, state: 'completed', finishedAt: Date.now(), scannedChats: 8, selectedRuns: 12, processedBatches: 3, reusedBatches: 1, newFacts: 4 };
      return reply(status());
    }
    if (req.path === '/update') {
      manual = { ...req.body, id: 'fixture-job', state: 'queued', modelKey: 'configured-model', timezone: 'Asia/Shanghai', startedAt: Date.now(), scannedChats: 0, selectedRuns: 0, processedBatches: 0, reusedBatches: 0, skippedRuns: 0, emptyRuns: 0 };
      return reply({ accepted: true, status: status() });
    }
    if (req.path === '/cancel') { manual = { ...manual, state: 'canceled' }; return reply(status()); }
    return res.status(404).json({ code: 404, msg: 'Unknown memory operation' });
  };
};

import { createInitialMemoryState, reduceMemoryState } from './memoryState';

const summary = { created: 1, updated: 0, archived: 0, unchanged: 0 };
const validation = { valid: false, errors: [{ line: 1, field: 'title', message: 'missing' }] };

it('preserves save results during reload and clears them for a fresh load', () => {
  const state = { ...createInitialMemoryState(), memoryPreferenceSaving: true,
    memoryPreferenceSaveSummary: summary, memoryPreferenceValidation: validation };
  const catalog = reduceMemoryState(state, { type: 'START_MEMORY_PREFERENCE_LOAD' });
  expect(catalog.memoryPreferenceSaving).toBe(true);
  expect(catalog.memoryPreferenceSaveSummary).toBeNull();
  expect(catalog.memoryPreferenceValidation).toBeNull();
  const reload = reduceMemoryState(state, { type: 'START_MEMORY_PREFERENCE_LOAD',
    clearSaving: true, preserveSaveSummary: true, preserveValidation: true });
  expect(reload.memoryPreferenceSaving).toBe(false);
  expect(reload.memoryPreferenceLoading).toBe(true);
  expect(reload.memoryPreferenceSaveSummary).toBe(summary);
  expect(reload.memoryPreferenceValidation).toBe(validation);
  expect(state.memoryPreferenceSaving).toBe(true);
});

it('keeps record editing validation and selection, but invalidates markdown validation', () => {
  const state = { ...createInitialMemoryState(), memoryPreferenceSelectedRecordId: 'selected',
    memoryPreferenceValidation: validation, memoryPreferenceSaveSummary: summary };
  const records = reduceMemoryState(state, { type: 'EDIT_MEMORY_PREFERENCE_RECORDS', records: [] });
  expect(records.memoryPreferenceSelectedRecordId).toBe('selected');
  expect(records.memoryPreferenceValidation).toBe(validation);
  expect(records.memoryPreferenceDirty).toBe(true);
  expect(records.memoryPreferenceSaveSummary).toBeNull();
  const deleted = reduceMemoryState(records, { type: 'EDIT_MEMORY_PREFERENCE_RECORDS', records: [], selectedRecordId: '' });
  expect(deleted.memoryPreferenceSelectedRecordId).toBe('');
  const markdown = reduceMemoryState(state, { type: 'EDIT_MEMORY_PREFERENCE_MARKDOWN', markdown: 'changed' });
  expect(markdown.memoryPreferenceValidation).toBeNull();
  expect(markdown.memoryPreferenceMarkdownDraft).toBe('changed');
});

it('synchronizes live drafts atomically and keeps validation on rejected or failed saves', () => {
  const state = { ...createInitialMemoryState(), memoryPreferenceValidation: validation,
    memoryPreferenceSaveSummary: summary, unrelated: new Map() };
  const saving = reduceMemoryState(state, { type: 'START_MEMORY_PREFERENCE_SAVE',
    drafts: { memoryPreferenceMarkdownDraft: 'live value' } });
  expect(saving.memoryPreferenceMarkdownDraft).toBe('live value');
  expect(saving.memoryPreferenceSaving).toBe(true);
  expect(saving.memoryPreferenceSaveSummary).toBeNull();
  for (const error of ['', 'network error']) {
    const stopped = reduceMemoryState(saving, { type: 'STOP_MEMORY_PREFERENCE_SAVE', error });
    expect(stopped.memoryPreferenceSaving).toBe(false);
    expect(stopped.memoryPreferenceValidation).toBe(validation);
    expect(stopped.memoryPreferenceError).toBe(error);
    expect(stopped.unrelated).toBe(state.unrelated);
  }
  const saved = reduceMemoryState(saving, { type: 'COMPLETE_MEMORY_PREFERENCE_SAVE', summary });
  expect(saved.memoryPreferenceSaveSummary).toBe(summary);
  expect(saved.memoryPreferenceValidation).toBeNull();
});

it('resets preferences without resetting the selected mode, preview or records session', () => {
  const state = { ...createInitialMemoryState(), memoryPreferenceMode: 'records' as const,
    memoryPreviewDraft: 'preview', memoryInfoSelectedRecordId: 'record',
    memoryPreferenceMarkdownDraft: 'old', memoryPreferenceDirty: true,
    memoryPreferenceSaving: true, memoryPreferenceValidation: validation };
  const next = reduceMemoryState(state, { type: 'RESET_MEMORY_PREFERENCES' });
  expect(next.memoryPreferenceMode).toBe('records');
  expect(next.memoryPreviewDraft).toBe('preview');
  expect(next.memoryInfoSelectedRecordId).toBe('record');
  expect(next.memoryPreferenceMarkdownDraft).toBe('');
  expect(next.memoryPreferenceDirty).toBe(false);
  expect(next.memoryPreferenceSaving).toBe(false);
  expect(next.memoryPreferenceValidation).toBeNull();
});

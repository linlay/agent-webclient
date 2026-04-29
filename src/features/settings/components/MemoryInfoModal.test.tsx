import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/shared/i18n";
import {
  createDefaultMemoryConsoleTab,
  createDefaultMemoryInfoFilters,
  createDefaultMemoryPreferenceMode,
} from "@/shared/api/memoryTypes";
import { MemoryInfoModalView } from "@/features/settings/components/MemoryInfoModal";

function renderView(
  overrides: Partial<React.ComponentProps<typeof MemoryInfoModalView>> = {},
) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, {
      locale: "en-US",
      fallbackLocale: "en-US",
      children: React.createElement(MemoryInfoModalView, {
        open: true,
        title: "Memory info",
        subtitle: "Current agent: Alice",
        activeTab: createDefaultMemoryConsoleTab(),
        onTabChange: () => undefined,
        onClose: () => undefined,
        recordsPanel: {
          agentKey: "agent-alice",
          loading: false,
          error: "",
          records: [],
          selectedRecordId: "",
          detail: null,
          detailLoading: false,
          detailError: "",
          filters: createDefaultMemoryInfoFilters(),
          missingAgent: false,
          onQuery: () => undefined,
          onRefresh: () => undefined,
          onSelectRecord: () => undefined,
          onFilterChange: () => undefined,
        },
        preferencesPanel: {
          agentKey: "agent-alice",
          missingAgent: false,
          scopes: [
            {
              scopeType: "agent",
              scopeKey: "agent:agent-alice",
              label: "AGENT",
              fileName: "AGENT.md",
              recordCount: 1,
              updatedAt: 1_777_344_000_000,
            },
          ],
          activeScopeType: "agent",
          activeScopeKey: "agent:agent-alice",
          label: "AGENT",
          fileName: "AGENT.md",
          meta: {
            editable: true,
            recordCount: 1,
            generatedFromStore: true,
          },
          loading: false,
          error: "",
          mode: createDefaultMemoryPreferenceMode(),
          markdownDraft: "# AGENT\n",
          recordsDraft: [
            {
              clientId: "draft:1",
              id: "mem_101",
              title: "偏好中文输出",
              summary: "Prefer Chinese output.",
              category: "general",
              importance: 8,
              confidence: 0.95,
              tags: ["preference"],
              status: "active",
              scopeType: "agent",
              scopeKey: "agent:agent-alice",
              createdAt: 1_777_344_000_000,
              updatedAt: 1_777_344_300_000,
            },
          ],
          selectedRecordId: "draft:1",
          dirty: false,
          saving: false,
          saveSummary: null,
          validation: null,
          editorRefs: {
            title: { current: null },
            summary: { current: null },
            category: { current: null },
            importance: { current: null },
            confidence: { current: null },
            tags: { current: null },
            markdown: { current: null },
          },
          onScopeSelect: () => undefined,
          onModeChange: () => undefined,
          onMarkdownChange: () => undefined,
          onRecordFieldChange: () => undefined,
          onSelectRecord: () => undefined,
          onNewRecord: () => undefined,
          onDeleteRecord: () => undefined,
          onValidate: () => undefined,
          onSave: () => undefined,
        },
        ...overrides,
      }),
    }),
  );
}

describe("MemoryInfoModalView", () => {
  it("renders the preferences tab by default", () => {
    const html = renderView();

    expect(html).toContain("Preferences");
    expect(html).toContain("Memory records");
    expect(html).toContain("Preference editor");
    expect(html).toContain("Current scope: AGENT · AGENT.md");
    expect(html.indexOf("Preference list")).toBeLessThan(
      html.indexOf("Preference detail"),
    );
    expect(html.indexOf("Preference detail")).toBeLessThan(
      html.indexOf("Preference editor"),
    );
  });

  it("renders preference drafts and inspector content", () => {
    const html = renderView();

    expect(html).toContain("偏好中文输出");
    expect(html).toContain("Prefer Chinese output.");
    expect(html).toContain("Preference detail");
    expect(html).toContain("Raw JSON");
    expect(html).toContain("memory-preference-record-marker");
  });

  it("renders markdown-mode guidance and friendly validation copy", () => {
    const html = renderView({
      preferencesPanel: {
        agentKey: "agent-alice",
        missingAgent: false,
        scopes: [
          {
            scopeType: "agent",
            scopeKey: "agent:agent-alice",
            label: "AGENT",
            fileName: "AGENT.md",
            recordCount: 1,
            updatedAt: 1_777_344_000_000,
          },
        ],
        activeScopeType: "agent",
        activeScopeKey: "agent:agent-alice",
        label: "AGENT",
        fileName: "AGENT.md",
        meta: {
          editable: true,
          recordCount: 1,
          generatedFromStore: true,
        },
        loading: false,
        error: "",
        mode: "markdown",
        markdownDraft: "# AGENT\n",
        recordsDraft: [],
        selectedRecordId: "",
        dirty: false,
        saving: false,
        saveSummary: null,
        validation: {
          valid: false,
          errors: [
            {
              line: 11,
              field: "field",
              message: "expected 'key: value'",
            },
          ],
          warnings: [],
        },
        editorRefs: {
          title: { current: null },
          summary: { current: null },
          category: { current: null },
          importance: { current: null },
          confidence: { current: null },
          tags: { current: null },
          markdown: { current: null },
        },
        onScopeSelect: () => undefined,
        onModeChange: () => undefined,
        onMarkdownChange: () => undefined,
        onRecordFieldChange: () => undefined,
        onSelectRecord: () => undefined,
        onNewRecord: () => undefined,
        onDeleteRecord: () => undefined,
        onValidate: () => undefined,
        onSave: () => undefined,
      },
    });

    expect(html).toContain("Markdown mode edits the scope&#x27;s raw entry format");
    expect(html).toContain("Switch to structured mode");
    expect(html).toContain("Line 11 field format:");
    expect(html).toContain("Markdown mode only accepts");
  });

  it("renders the records tab and detail fields", () => {
    const html = renderView({
      activeTab: "records",
      recordsPanel: {
        agentKey: "agent-alice",
        loading: false,
        error: "",
        records: [
          {
            id: "mem_201",
            title: "Memory record",
            kind: "fact",
            scopeType: "user",
            status: "active",
            category: "general",
            importance: 8,
            summary: "A memory summary.",
            updatedAt: 1_777_344_300_000,
            tags: ["memory"],
          },
        ],
        selectedRecordId: "mem_201",
        detail: {
          id: "mem_201",
          sourceTable: "MEMORIES",
          record: {
            id: "mem_201",
            title: "Memory record",
            kind: "fact",
            scopeType: "user",
            scopeKey: "user:joe",
            status: "active",
            category: "general",
            importance: 8,
            confidence: 0.95,
            agentKey: "agent-alice",
            chatId: "chat_1",
            sourceType: "tool-write",
            refId: "run_1",
            summary: "A memory summary.",
            tags: ["memory"],
            createdAt: 1_777_344_000_000,
            updatedAt: 1_777_344_300_000,
          },
          rawFields: {
            detail: "A memory summary.",
          },
          embedding: {
            hasEmbedding: true,
            model: "text-embedding-3-large",
          },
        },
        detailLoading: false,
        detailError: "",
        filters: createDefaultMemoryInfoFilters(),
        missingAgent: false,
        onQuery: () => undefined,
        onRefresh: () => undefined,
        onSelectRecord: () => undefined,
        onFilterChange: () => undefined,
      },
    });

    expect(html).toContain("Memory record");
    expect(html).toContain("Source table");
    expect(html).toContain("Embedding available");
  });

  it("renders missing-agent empty states for both tabs", () => {
    const preferenceHtml = renderView({
      preferencesPanel: {
        agentKey: "",
        missingAgent: true,
        scopes: [],
        activeScopeType: "agent",
        activeScopeKey: "",
        label: "AGENT",
        fileName: "AGENT.md",
        meta: null,
        loading: false,
        error: "",
        mode: "records",
        markdownDraft: "",
        recordsDraft: [],
        selectedRecordId: "",
        dirty: false,
        saving: false,
        saveSummary: null,
        validation: null,
        editorRefs: {
          title: { current: null },
          summary: { current: null },
          category: { current: null },
          importance: { current: null },
          confidence: { current: null },
          tags: { current: null },
          markdown: { current: null },
        },
        onScopeSelect: () => undefined,
        onModeChange: () => undefined,
        onMarkdownChange: () => undefined,
        onRecordFieldChange: () => undefined,
        onSelectRecord: () => undefined,
        onNewRecord: () => undefined,
        onDeleteRecord: () => undefined,
        onValidate: () => undefined,
        onSave: () => undefined,
      },
    });
    expect(preferenceHtml).toContain("Select an agent before opening preferences.");

    const recordHtml = renderView({
      activeTab: "records",
      recordsPanel: {
        agentKey: "",
        loading: false,
        error: "",
        records: [],
        selectedRecordId: "",
        detail: null,
        detailLoading: false,
        detailError: "",
        filters: createDefaultMemoryInfoFilters(),
        missingAgent: true,
        onQuery: () => undefined,
        onRefresh: () => undefined,
        onSelectRecord: () => undefined,
        onFilterChange: () => undefined,
      },
    });
    expect(recordHtml).toContain("Select an agent before opening memory info.");
  });
});

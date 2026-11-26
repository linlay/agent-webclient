import { normalizeTimelineAttachments } from '@/features/events/lib/timelineAttachments';

describe('normalizeTimelineAttachments', () => {
  it('keeps renderable attachment metadata from references', () => {
    expect(
      normalizeTimelineAttachments([
        {
          id: 'img_1',
          type: 'image',
          name: 'preview.png',
          mimeType: 'image/png',
          sizeBytes: 2048,
          url: '/api/resource?file=chat_1%2Fpreview.png',
        },
      ]),
    ).toEqual([
      {
        id: 'img_1',
        type: 'image',
        name: 'preview.png',
        mimeType: 'image/png',
        size: 2048,
        url: '/api/resource?file=chat_1%2Fpreview.png',
      },
    ]);
  });

  it('keeps the latest attachment when names are duplicated', () => {
    expect(
      normalizeTimelineAttachments([
        {
          type: 'file',
          name: 'notes.md',
          size: 10,
          url: '/old-notes',
        },
        {
          type: 'image',
          name: 'preview.png',
          size: 20,
          url: '/preview',
        },
        {
          type: 'file',
          name: 'notes.md',
          size: 30,
          url: '/latest-notes',
        },
      ]),
    ).toEqual([
      {
        type: 'image',
        name: 'preview.png',
        size: 20,
        url: '/preview',
      },
      {
        type: 'file',
        name: 'notes.md',
        size: 30,
        url: '/latest-notes',
      },
    ]);
  });

  it('displays URL references as addresses and ignores file metadata', () => {
    const url = 'https://example.com/api/resource?file=a.png#one';
    const other = 'https://example.com/api/resource?file=a.png#two';
    expect(normalizeTimelineAttachments([
      { type: 'url', url, name: 'a.png', mimeType: 'image/png' },
      { type: 'url', url },
      { type: 'url', url: other },
      { type: 'url', url: 'javascript:alert(1)' },
    ])).toEqual([
      { type: 'url', name: url, url },
      { type: 'url', name: other, url: other },
    ]);
  });
});

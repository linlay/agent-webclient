import { normalizeTimelineAttachments } from '@/features/artifacts/lib/timelineAttachments';

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
});

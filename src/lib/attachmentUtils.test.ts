import {
  formatAttachmentSize,
  getAttachmentIconName,
  getAttachmentKind,
  getAttachmentKindLabel,
  getAttachmentUrl,
} from './attachmentUtils';

describe('attachmentUtils', () => {
  it('formats attachment sizes into readable strings', () => {
    expect(formatAttachmentSize(0)).toBe('');
    expect(formatAttachmentSize(512)).toBe('512 B');
    expect(formatAttachmentSize(1536)).toBe('1.5 KB');
  });

  it('infers attachment kind from backend type, mime type, and extension', () => {
    expect(getAttachmentKind({ type: 'image', name: 'archive.bin' })).toBe('image');
    expect(getAttachmentKind({ mimeType: 'image/png', name: 'demo.bin' })).toBe('image');
    expect(getAttachmentKind({ name: 'photo.JPG' })).toBe('image');
    expect(getAttachmentKind({ name: 'notes.md' })).toBe('file');
    expect(getAttachmentKindLabel({ name: 'photo.png' })).toBe('图片');
    expect(getAttachmentKindLabel({ name: 'notes.md' })).toBe('文件');
  });

  it('maps common file types to more specific icons', () => {
    expect(getAttachmentIconName({ name: 'report.pdf' })).toBe('picture_as_pdf');
    expect(getAttachmentIconName({ name: 'sheet.xlsx' })).toBe('table_chart');
    expect(getAttachmentIconName({ name: 'archive.zip' })).toBe('folder_zip');
    expect(getAttachmentIconName({ name: 'notes.md' })).toBe('description');
  });

  it('prefers local preview urls over resource urls when both exist', () => {
    expect(
      getAttachmentUrl({
        previewUrl: 'blob:demo',
        url: '/api/resource?file=chat_1%2Fdemo.png',
      }),
    ).toBe('blob:demo');
    expect(getAttachmentUrl({ url: '/api/resource?file=chat_1%2Fdemo.png' })).toBe(
      '/api/resource?file=chat_1%2Fdemo.png',
    );
  });
});

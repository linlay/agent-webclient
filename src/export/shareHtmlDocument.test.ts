/** @jest-environment jsdom */
import { mapMediaSrcset, prepareShareHtml } from "./shareHtmlDocument";

it("replaces only direct mapped media while retaining document scripts, styles, attributes and srcset descriptors", () => {
  const html = prepareShareHtml({
    html: `<!DOCTYPE html><html><head><style>.photo{border:1px solid red}</style><script src="https://cdn.example.test/chart.js"></script></head><body><picture><source srcset="raw.png 1x, @chat/big.png 2x"><img class="photo" src="raw.png" width="80" onload="window.ready=true"></picture><video src="clip.mp4" poster="raw.png" controls></video><audio><source src="missing.mp3"></audio><script>window.chart=1</script></body></html>`,
    mediaRefs: [["raw.png", "image"], ["@chat/big.png", "image"], ["clip.mp4", "video"], ["missing.mp3", "missing"]],
    media: [{ id: "image", type: "image/png", bytes: new ArrayBuffer(1) }, { id: "video", type: "video/mp4", bytes: new ArrayBuffer(2) }],
    missing: [["missing", "not found"]], unavailable: "unavailable",
  }, (blob) => `blob:frozen-${blob.size}`);
  expect(html).toContain('srcset="blob:frozen-1 1x, blob:frozen-1 2x"');
  expect(html).toContain('poster="blob:frozen-1"');
  expect(html).toContain('src="blob:frozen-2"');
  expect(html).not.toContain('src="missing.mp3"');
  expect(html).toContain('role="status">not found');
  expect(html).toContain('onload="window.ready=true"');
  expect(html).toContain('https://cdn.example.test/chart.js');
  expect(html).toContain('<script>window.chart=1</script>');
  expect(html).toContain('.photo{border:1px solid red}');
});

it("clears unbound local paths and leaves HTTPS/data media without scanning CSS or script dependencies", () => {
  const create = jest.fn();
  const html = prepareShareHtml({ html: '<img src="file:///private/photo.png"><img src="https://example.test/i.png"><img src="data:image/png;base64,AA=="><style>body{background:url(local.png)}</style>', mediaRefs: [], media: [], missing: [], unavailable: "unavailable" }, create);
  expect(html).not.toContain('src="file:');
  expect(html).toContain('src="https://example.test/i.png"');
  expect(html).toContain('src="data:image/png;base64,AA=="');
  expect(html).toContain('background:url(local.png)');
  expect(create).not.toHaveBeenCalled();
  expect(mapMediaSrcset('data:image/png;base64,AA== 1x, x.png 2x', (url) => url)).toBe('data:image/png;base64,AA== 1x, x.png 2x');
});

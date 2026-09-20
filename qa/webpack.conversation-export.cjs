const fs = require("node:fs");
const path = require("node:path");
const webpackConfig = require("../webpack.export.config.js");

const root = path.resolve(__dirname, "..");
const shellPath = path.join(root, "public/conversation-export.html");
const localSnapshotPath = path.join(root, ".local/share-preview/current.snapshot.json");
const snapshotPath = process.env.CONVERSATION_PREVIEW_SNAPSHOT
  ? path.resolve(process.env.CONVERSATION_PREVIEW_SNAPSHOT)
  : null;
const port = Number(process.env.PORT || 11959);
const assetPath = "/assets/conversation-export/dev/";
const markers = {
  __CONVERSATION_EXPORT_ASSET_SET__: "dev",
  __CONVERSATION_EXPORT_CSS_URL__: `${assetPath}runtime.css`,
  __CONVERSATION_EXPORT_RUNTIME_URL__: `${assetPath}runtime.js`,
  __CONVERSATION_EXPORT_CSP__: [
    "default-src 'none'",
    `connect-src ws://127.0.0.1:${port}`,
    "img-src data:",
    "font-src 'self'",
    "style-src 'none'",
    "style-src-elem 'self'",
    "style-src-attr 'unsafe-inline'",
    "script-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; "),
};

function previewSnapshot(name) {
  if (snapshotPath) {
    const raw = fs.readFileSync(snapshotPath, "utf8");
    if (Buffer.byteLength(raw) > 20 * 1024 * 1024) {
      throw new Error("Snapshot exceeds the 20 MiB export limit.");
    }
    return JSON.parse(raw);
  }
  const fixtureModule = require.resolve("./conversation-export-fixtures.cjs");
  delete require.cache[fixtureModule];
  const fixtures = require(fixtureModule);
  if (!Object.hasOwn(fixtures, name)) {
    throw new Error(`Unknown preview case. Choose: ${Object.keys(fixtures).join(", ")}.`);
  }
  return fixtures[name];
}

function previewHtml(snapshot) {
  let html = fs.readFileSync(shellPath, "utf8");
  for (const [marker, value] of Object.entries(markers)) {
    if (!html.includes(marker)) throw new Error(`Missing template marker ${marker}.`);
    html = html.replace(marker, value);
  }
  // Development assets change on every rebuild, so the production SRI attributes
  // cannot be pinned here. The release build still calculates and checks them.
  html = html.replace(/\s+integrity="__CONVERSATION_EXPORT_(?:CSS|RUNTIME)_INTEGRITY__"/gu, "");
  const payload = JSON.stringify(snapshot).replace(/</gu, "\\u003c");
  const marker = "__CONVERSATION_EXPORT_SNAPSHOT_JSON_V1__";
  if (!html.includes(marker)) throw new Error(`Missing template marker ${marker}.`);
  return html.replace(marker, payload);
}

module.exports = {
  ...webpackConfig,
  mode: "development",
  output: {
    ...webpackConfig.output,
    path: path.join(root, "dist/export-preview"),
    publicPath: assetPath,
  },
  optimization: {
    ...webpackConfig.optimization,
    minimize: false,
  },
  devServer: {
    host: "127.0.0.1",
    port,
    hot: false,
    liveReload: true,
    static: false,
    watchFiles: [shellPath, path.join(__dirname, "conversation-export-fixtures.cjs"), localSnapshotPath, ...(snapshotPath ? [snapshotPath] : [])],
    setupMiddlewares(middlewares, server) {
      server.app.get("/", (_request, response) => response.redirect("/preview"));
      server.app.get("/preview", (request, response) => {
        try {
          const name = typeof request.query.case === "string" ? request.query.case : "default";
          response.set("Cache-Control", "no-store").type("html").send(previewHtml(previewSnapshot(name)));
        } catch (error) {
          response.status(400).type("text").send(error.message);
        }
      });
      for (const [filename, source] of [
        ["echarts.min.js", "echarts/dist/echarts.min.js"],
        ["mermaid.min.js", "mermaid/dist/mermaid.min.js"],
      ]) {
        server.app.get(`${assetPath}${filename}`, (_request, response) => {
          response.type("js").sendFile(require.resolve(source));
        });
      }
      return middlewares;
    },
  },
};

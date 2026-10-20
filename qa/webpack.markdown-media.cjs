const path = require("node:path");

module.exports = (env, argv) => {
  const config = require("./webpack.appearance.cjs")(env, argv);
  config.entry = "./qa/markdown-media-preview.tsx";
  config.output.path = path.resolve(__dirname, "../build/markdown-media");
  config.devServer.port = Number(process.env.MEDIA_QA_PORT || 11963);
  const setup = config.devServer.setupMiddlewares;
  config.devServer.setupMiddlewares = (middlewares, server) => {
    setup(middlewares, server);
    const image = path.resolve(__dirname, "../docs/images/screenshots/debug-sidebar.png");
    const workspace = new Map([
      ["docs/images/screenshots/debug-sidebar.png", image],
      ["videos/期权诞生 短片.mp4", process.env.MEDIA_QA_VIDEO],
      ["audio/preview.wav", process.env.MEDIA_QA_AUDIO],
    ]);
    const resources = new Map([
      ["/media-qa/期权诞生 短片.mp4", process.env.MEDIA_QA_VIDEO],
      ["/tmp/media-qa.png", image],
    ]);
    server.app.get("/api/file", (req, res) => {
      const source = workspace.get(req.query.path);
      if (req.query.agentKey !== "media-qa-owner" || req.query.response !== "content" || !source) return res.sendStatus(404);
      res.sendFile(source);
    });
    server.app.get("/api/resource", (req, res) => {
      const source = resources.get(req.query.file);
      if (req.query.chatId !== "media-qa-chat" || !source) return res.sendStatus(404);
      res.sendFile(source);
    });
    return middlewares;
  };
  return config;
};

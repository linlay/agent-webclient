const path = require('node:path');
module.exports = (env, argv) => {
  const config = require('./webpack.appearance.cjs')(env, argv);
  config.entry = './qa/markdown-html-preview.tsx';
  config.output.path = process.env.AGENT_HTML_PREVIEW_QA_DIR
    ? path.resolve(process.env.AGENT_HTML_PREVIEW_QA_DIR)
    : path.resolve(__dirname, '../build/markdown-html');
  config.devServer.port = 11962;
  return config;
};

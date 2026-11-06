const path = require('node:path');
module.exports = (env, argv) => {
  const config = require('./webpack.appearance.cjs')(env, argv);
  config.entry = './qa/engine-session-preview.tsx';
  config.output.path = path.resolve(__dirname, '../build/engine-session');
  config.devServer.port = 11967;
  config.devServer.static = false;
  return config;
};

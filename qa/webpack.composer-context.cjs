const path = require('node:path');
module.exports = (_env, argv) => {
  const config = require('./webpack.appearance.cjs')(_env, argv);
  config.entry = './qa/composer-context-preview.tsx';
  config.output.path = path.resolve(__dirname, '../build/composer-context');
  config.devServer.port = 11962;
  config.devServer.static = false;
  return config;
};

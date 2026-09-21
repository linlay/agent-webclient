const path = require('node:path');
module.exports = (env, argv) => {
  const config = require('./webpack.appearance.cjs')(env, argv);
  config.entry = './qa/image-generation-preview.tsx';
  config.output.path = path.resolve(__dirname, '../build/image-generation');
  config.devServer.port = 11959;
  return config;
};

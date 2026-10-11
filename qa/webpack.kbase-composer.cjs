const path = require('node:path');
module.exports = (_env, argv) => {
 const config = require('./webpack.appearance.cjs')(_env, argv);
 config.entry = './qa/kbase-composer-preview.tsx';
 config.output.path = path.resolve(__dirname, '../build/kbase-composer');
 config.devServer.port = 11965;
 config.devServer.static = false;
 return config;
};

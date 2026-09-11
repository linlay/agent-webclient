const path = require('node:path');
process.env.BASE_URL ||= 'http://127.0.0.1:9';
module.exports = (_env, argv) => {
  const config = require('../webpack.config.js')({}, argv);
  config.entry = './qa/appearance-preview.tsx';
  config.output.path = path.resolve(__dirname, '../build/appearance');
  config.output.clean = true;
  config.module.rules[0].use = { loader: 'ts-loader', options: { transpileOnly: true, compilerOptions: { rootDir: '..' } } };
  config.devServer.port = Number(process.env.PORT || 11958);
  config.devServer.host = '127.0.0.1';
  config.devServer.proxy = [];
  config.devServer.setupMiddlewares = (middlewares, server) => {
    server.app.get('/runtime-config.js', (_req, res) => res.type('js').send('globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {};'));
    return middlewares;
  };
  config.devServer.hot = false;
  config.devServer.client = false;
  config.devtool = false;
  config.plugins = config.plugins.filter((plugin) => !plugin.constructor.name.includes('Monaco'));
  config.plugins.push({ apply(compiler) {
    compiler.hooks.thisCompilation.tap('AppearancePreviewRuntime', compilation => {
      compilation.hooks.processAssets.tap({ name: 'AppearancePreviewRuntime', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL }, () => {
        compilation.emitAsset('runtime-config.js', new compiler.webpack.sources.RawSource('globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {};\n'));
      });
    });
  } });
  return config;
};

const path = require('node:path');
const fs = require('node:fs');
process.env.BASE_URL ||= 'http://127.0.0.1:9';
module.exports = (_env, argv) => {
 const config = require('../webpack.config.js')({}, argv);
 config.entry = './qa/management-preview.tsx';
 config.output.path = path.resolve(__dirname, '../build/management');
 config.module.rules[0].use = { loader: 'ts-loader', options: { transpileOnly: true, compilerOptions: { rootDir: '/' } } };
 if (process.env.QA_BASELINE) config.resolve.alias['@'] = path.join(process.env.QA_BASELINE, 'src');
 config.resolve.alias = { '@/shared/data/api/routedClient$': path.join(__dirname, 'management-routed.ts'), '@/features/transport/hooks/useRealtimeTransport$': path.join(__dirname, 'management-push.ts'), ...config.resolve.alias };
 for (const rule of config.module.rules) if (Array.isArray(rule.use)) rule.use = rule.use.map(loader => loader === 'postcss-loader' ? { loader, options: { postcssOptions: { config: path.resolve(__dirname, '../postcss.config.js') } } } : loader);
 config.resolve.modules = [path.resolve(__dirname, '../node_modules'), 'node_modules'];
 config.devServer.port = Number(process.env.PORT || 11961);
 config.devServer.host = '127.0.0.1'; config.devServer.proxy = []; config.devServer.hot = false; config.devServer.client = false; config.devtool = false;
 config.devServer.setupMiddlewares = (middlewares, server) => {
   server.app.get('/runtime-config.js', (_req,res) => res.type('js').send('globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = {};'));
   server.app.use('/api', (req,res) => res.json({ code: 0, msg: '', data: require('./management-fixtures.cjs')('/api' + req.path, req.query) }));
   server.app.get('/qa-wallpaper', (_req,res) => process.env.QA_WALLPAPER ? res.sendFile(path.resolve(process.env.QA_WALLPAPER)) : res.sendStatus(404));
   server.app.get('/preview', (_req,res) => res.type('html').send(fs.readFileSync(path.join(__dirname,'management-host.html'),'utf8')));
   return middlewares;
 };
 return config;
};

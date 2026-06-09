const fs = require('fs');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const port = Number(process.env.PORT || 11948);
const apiTarget = String(process.env.BASE_URL || '').trim();
const voiceTarget = String(process.env.VOICE_BASE_URL || '').trim();
const allowedHostsEnv = String(process.env.DEV_SERVER_ALLOWED_HOSTS || 'all').trim();
const allowedHosts = allowedHostsEnv === 'all'
  ? 'all'
  : allowedHostsEnv
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

const runtimeConfigEnvKeys = [
  'DESKTOP_APP',
  'DEBUG_PANEL_ENABLED',
  'DELTA_LOGS_ENABLED',
  'SETTINGS_MENU_ENABLED',
  'QUICK_ACTIONS_ENABLED',
  'MEMORY_ENABLED',
  'VOICE_ASR_CLIENT_GATE_ENABLED',
  'VOICE_ASR_CLIENT_GATE_RMS_THRESHOLD',
  'VOICE_ASR_CLIENT_GATE_OPEN_HOLD_MS',
  'VOICE_ASR_CLIENT_GATE_CLOSE_HOLD_MS',
  'VOICE_ASR_CLIENT_GATE_PRE_ROLL_MS',
];

function parseEnvFileContent(content) {
  const values = {};
  String(content || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) return;
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      values[key] = value;
    });
  return values;
}

function readRuntimeEnvFile() {
  try {
    return parseEnvFileContent(fs.readFileSync(path.resolve(__dirname, '.env'), 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return {};
    throw error;
  }
}

function resolveRuntimeConfig() {
  const env = {
    ...process.env,
    ...readRuntimeEnvFile(),
  };
  const config = runtimeConfigEnvKeys.reduce((config, key) => {
    config[key] = String(env[key] == null ? '' : env[key]).trim();
    return config;
  }, {});
  config.VOICE_ENABLED = String(Boolean(String(env.VOICE_BASE_URL || '').trim()));
  return config;
}

function createRuntimeConfigScript() {
  return `globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = ${JSON.stringify(resolveRuntimeConfig())};\n`;
}

function isSseQueryRequest(req) {
  const url = String(req?.url || '');
  return url === '/api/query' || url.startsWith('/api/query?');
}

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  if (!isProd && !apiTarget) {
    throw new Error('BASE_URL is required for development. Copy .env.example to .env and set BASE_URL.');
  }
  const voiceProxyRules = voiceTarget
    ? [
      {
        context: ['/api/voice/ws'],
        target: voiceTarget,
        changeOrigin: true,
        ws: true,
      },
      {
        context: ['/api/voice'],
        target: voiceTarget,
        changeOrigin: true,
        ws: false,
      },
    ]
    : [];

  return {
    entry: './src/app/index.tsx',
    mode: isProd ? 'production' : 'development',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: isProd ? 'js/[name].[contenthash:8].js' : 'js/[name].js',
      chunkFilename: isProd ? 'js/[name].[contenthash:8].chunk.js' : 'js/[name].chunk.js',
      publicPath: '/',
      clean: true,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          include: /\.module\.css$/,
          use: [
            isProd ? MiniCssExtractPlugin.loader : 'style-loader',
            {
              loader: 'css-loader',
              options: {
                modules: {
                  auto: true,
                  namedExport: false,
                  exportLocalsConvention: 'as-is',
                  localIdentName: isProd ? '[hash:base64:8]' : '[name]__[local]--[hash:base64:5]',
                },
              },
            },
            'postcss-loader',
          ],
        },
        {
          test: /\.css$/,
          exclude: /\.module\.css$/,
          use: [
            isProd ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader',
            'postcss-loader',
          ],
        },
        {
          test: /\.(png|jpe?g|gif|svg)$/i,
          type: 'asset/resource',
        },
        {
          test: /\.(woff2?|eot|ttf|otf)$/i,
          type: 'asset/resource',
          generator: {
            filename: isProd
              ? 'fonts/[name].[contenthash:8][ext][query]'
              : 'fonts/[name][ext][query]',
          },
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './public/index.html',
        title: 'AGENT Webclient',
      }),
      ...(isProd
        ? [
          new MiniCssExtractPlugin({
            filename: 'css/[name].[contenthash:8].css',
          }),
        ]
        : []),
    ],
    devServer: {
      host: '0.0.0.0',
      port,
      allowedHosts,
      compress: false,
      hot: true,
      client: {
        webSocketURL: {
          pathname: '/__webpack_hmr',
        },
      },
      historyApiFallback: {
        disableDotRule: true,
      },
      webSocketServer: {
        type: 'ws',
        options: {
          path: '/__webpack_hmr',
        },
      },
      proxy: [
        {
          context: ['/ws'],
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
        ...voiceProxyRules,
        {
          context: ['/api'],
          target: apiTarget,
          changeOrigin: true,
          ws: false,
          onProxyReq: function (proxyReq, req) {
            if (!isSseQueryRequest(req)) {
              return;
            }
            proxyReq.removeHeader('accept-encoding');
            proxyReq.setHeader('Accept-Encoding', '');
          },
          onProxyRes: function (proxyRes, req, res) {
            const header = proxyRes.headers['content-disposition'];
            header && res.setHeader('Content-Disposition', header);
            const statusCode = typeof proxyRes.statusCode === 'number' ? proxyRes.statusCode : 200;
            const contentType = String(proxyRes.headers['content-type'] || '').toLowerCase();
            const isSuccessfulSseResponse = statusCode >= 200
              && statusCode < 300
              && contentType.startsWith('text/event-stream');
            if (isSuccessfulSseResponse) {
              res.setHeader('Connection', 'keep-alive');
              res.setHeader('Cache-Control', 'no-cache, no-transform');
              res.setHeader('X-Accel-Buffering', 'no');
            }
          }
        },
      ],
      setupMiddlewares: (middlewares, devServer) => {
        devServer.app.get('/runtime-config.js', (_req, res) => {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(createRuntimeConfigScript());
        });
        return middlewares;
      },
    },
    devtool: isProd ? 'source-map' : 'eval-cheap-module-source-map',
    performance: {
      hints: isProd ? 'warning' : false,
    },
    optimization: {
      splitChunks: {
        chunks: 'all',
      },
    },
  };
};

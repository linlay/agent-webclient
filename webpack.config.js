const path = require('path');
const webpack = require('webpack');
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

function defineEnvLiteral(value) {
  return JSON.stringify(value == null ? '' : String(value));
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
  if (!isProd && !voiceTarget) {
    throw new Error('VOICE_BASE_URL is required for development. Copy .env.example to .env and set VOICE_BASE_URL.');
  }

  return {
    entry: './src/index.tsx',
    mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
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
      new webpack.DefinePlugin({
        'globalThis.__APP_VOICE_ASR_CLIENT_GATE_ENABLED__': defineEnvLiteral(process.env.APP_VOICE_ASR_CLIENT_GATE_ENABLED),
        'globalThis.__APP_VOICE_ASR_CLIENT_GATE_RMS_THRESHOLD__': defineEnvLiteral(process.env.APP_VOICE_ASR_CLIENT_GATE_RMS_THRESHOLD),
        'globalThis.__APP_VOICE_ASR_CLIENT_GATE_OPEN_HOLD_MS__': defineEnvLiteral(process.env.APP_VOICE_ASR_CLIENT_GATE_OPEN_HOLD_MS),
        'globalThis.__APP_VOICE_ASR_CLIENT_GATE_CLOSE_HOLD_MS__': defineEnvLiteral(process.env.APP_VOICE_ASR_CLIENT_GATE_CLOSE_HOLD_MS),
        'globalThis.__APP_VOICE_ASR_CLIENT_GATE_PRE_ROLL_MS__': defineEnvLiteral(process.env.APP_VOICE_ASR_CLIENT_GATE_PRE_ROLL_MS),
      }),
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
      historyApiFallback: true,
      proxy: [
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

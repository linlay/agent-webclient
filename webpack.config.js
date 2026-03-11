const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const port = Number(process.env.PORT || 11948);
const apiTarget = String(process.env.BASE_URL || '').trim();
const allowedHostsEnv = String(process.env.DEV_SERVER_ALLOWED_HOSTS || 'all').trim();
const allowedHosts = allowedHostsEnv === 'all'
  ? 'all'
  : allowedHostsEnv
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  if (!isProd && !apiTarget) {
    throw new Error('BASE_URL is required for development. Copy .env.example to .env and set BASE_URL.');
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
      hot: true,
      historyApiFallback: true,
      proxy: [
        {
          context: ['/api/ap'],
          target: apiTarget,
          changeOrigin: true,
          onProxyRes: function (proxyRes, req, res) {
            const header = proxyRes.headers['content-disposition'];
            header && res.setHeader('Content-Disposition', header);
            // 禁用SSE请求缓存/缓冲
            const accept = String(req.headers.accept || '');
            const reqUrl = String(req.url || '');
            const isSseRequest = accept.includes('text/event-stream')
              || reqUrl.startsWith('/api/ap/query');
            if (isSseRequest) {
              res.writeHead(res.statusCode, {
                'Content-Type': 'text/event-stream',
                Connection: 'keep-alive',
                'Cache-Control': 'no-cache, no-transform',
                'X-Accel-Buffering': 'no'
              });
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

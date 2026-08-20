const path = require("node:path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
  mode: "production",
  target: ["web", "es2020"],
  entry: "./src/export/index.tsx",
  output: {
    path: path.resolve(__dirname, "dist/export-build"),
    filename: "runtime.js",
    chunkFilename: "forbidden-[name].js",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/u,
        use: {
          loader: "ts-loader",
          options: {
            compilerOptions: { sourceMap: false },
          },
        },
        exclude: /node_modules/u,
      },
      {
        test: /\.module\.css$/u,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: "css-loader",
            options: {
              modules: {
                namedExport: false,
                exportLocalsConvention: "as-is",
                localIdentName: "[hash:base64:8]",
              },
            },
          },
        ],
      },
      {
        test: /\.css$/u,
        exclude: /\.module\.css$/u,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
      {
        test: /\.(?:woff2?|ttf|otf)$/u,
        type: "asset/resource",
        generator: {
          filename: "fonts/[name][ext]",
        },
      },
    ],
  },
  plugins: [new MiniCssExtractPlugin({ filename: "runtime.css" })],
  devtool: false,
  performance: false,
  optimization: {
    minimize: true,
    runtimeChunk: false,
    splitChunks: false,
  },
};

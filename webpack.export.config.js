const fs = require("node:fs");
const { checkExportModules } = require("./scripts/conversation-export-boundary");
const path = require("node:path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

class ExportModuleBoundaryPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap("ExportModuleBoundary", (compilation) => {
      const modules = new Set();
      const visit = (module, result) => {
        if (module.resource) result.add(path.relative(__dirname, module.resource.split("?")[0]).split(path.sep).join("/"));
        if (module.modules) for (const child of module.modules) visit(child, result);
      };
      for (const chunk of compilation.chunks) {
        for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) visit(module, modules);
      }
      const bootstrap = compilation.entrypoints.get("html-preview-bootstrap").getEntrypointChunk();
      if ([...bootstrap.getAllReferencedChunks()].length !== 1) throw new Error("HTML bootstrap must be a single self-contained script.");
      const guestModules = new Set();
      for (const module of compilation.chunkGraph.getChunkModulesIterable(bootstrap)) visit(module, guestModules);
      for (const name of guestModules) {
        if (!new Set(["src/export/html-preview-bootstrap.ts", "src/export/shareHtmlDocument.ts", "src/shared/utils/htmlVisualizationAssets.ts"]).has(name)) {
          throw new Error(`HTML bootstrap includes an unexpected module: ${name}`);
        }
      }
      const graph = { modules: [...modules].sort(), assets: Object.keys(compilation.assets).sort() };
      checkExportModules(__dirname, graph.modules);
      fs.writeFileSync(path.join(__dirname, "dist/export-module-graph.json"), JSON.stringify(graph));
    });
  }
}

module.exports = {
  mode: "production",
  target: ["web", "es2020"],
  entry: {
    runtime: "./src/export/index.tsx",
    "html-preview-bootstrap": "./src/export/html-preview-bootstrap.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist/export-build"),
    filename: "[name].js",
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
          "postcss-loader",
        ],
      },
      {
        test: /\.css$/u,
        exclude: /\.module\.css$/u,
        use: [MiniCssExtractPlugin.loader, "css-loader", "postcss-loader"],
      },
      {
        test: /\.svg$/u,
        type: "asset/resource",
        generator: {
          filename: "icons/[name][contenthash][ext]",
        },
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
  plugins: [new MiniCssExtractPlugin({ filename: "runtime.css" }), new ExportModuleBoundaryPlugin()],
  devtool: false,
  performance: false,
  optimization: {
    minimize: true,
    runtimeChunk: false,
    splitChunks: false,
  },
};

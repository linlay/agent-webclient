import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const webpack = require("webpack");
const projectRoot = process.cwd();

function parseArgs(argv) {
  const args = argv.slice(2);
  let outputPath = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const [key, inlineValue] = arg.split("=");
    const nextValue = inlineValue ?? args[index + 1];
    if (key === "--output") {
      outputPath = nextValue;
      if (inlineValue === undefined) {
        index += 1;
      }
    }
  }

  if (!outputPath) {
    throw new Error("missing --output for backend bundle");
  }

  return path.resolve(projectRoot, outputPath);
}

export async function buildBackendBundle(outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const compiler = webpack({
    mode: "production",
    target: "node18",
    entry: path.join(projectRoot, "backend", "server.js"),
    output: {
      path: path.dirname(outputPath),
      filename: path.basename(outputPath),
      library: {
        type: "commonjs2"
      }
    },
    optimization: {
      minimize: false
    },
    devtool: false,
    externalsPresets: {
      node: true
    },
    performance: false
  });

  await new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      void compiler.close(() => {});
      if (error) {
        reject(error);
        return;
      }
      if (!stats || stats.hasErrors()) {
        reject(new Error(stats?.toString({ all: false, errors: true }) || "backend bundle failed"));
        return;
      }
      resolve(undefined);
    });
  });

  return outputPath;
}

async function main() {
  const outputPath = parseArgs(process.argv);
  await buildBackendBundle(outputPath);
  console.log(`bundled backend into ${path.relative(projectRoot, outputPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { randomUUID } = require('crypto');
const webpack = require('webpack');

module.exports = function diagnosticPlugins(root, production) {
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // Release builds use an isolated workspace without .git.
    try { commit = JSON.parse(fs.readFileSync(path.join(root, '.webclient-build-source.json'), 'utf8')).commit || 'unknown'; }
    catch { /* Source archives may have no revision metadata. */ }
  }
  const build = {
    version: fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim(),
    commit,
    builtAt: new Date().toISOString(),
    id: randomUUID(),
  };
  const directory = `../diagnostics/${build.id}`;
  return [
    new webpack.DefinePlugin({ __WEBCLIENT_BUILD__: JSON.stringify(build) }),
    ...(production ? [
      // Maps live outside dist, so the Desktop bundle never serves or ships source code.
      new webpack.SourceMapDevToolPlugin({
        filename: `${directory}/[file].map`,
        append: false,
        moduleFilenameTemplate: 'webpack://agent-webclient/[resource-path]',
      }),
      {
        apply(compiler) {
          compiler.hooks.thisCompilation.tap('DiagnosticBuildInfo', (compilation) => {
            compilation.hooks.processAssets.tap({ name: 'DiagnosticBuildInfo', stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL }, () => {
              compilation.emitAsset(`${directory}/build.json`, new webpack.sources.RawSource(JSON.stringify(build, null, 2)));
            });
          });
        },
      },
    ] : []),
  ];
};

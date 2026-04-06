#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const envPath = fs.existsSync(path.join(repoRoot, '.env'))
  ? path.join(repoRoot, '.env')
  : path.join(repoRoot, '.env.example');

const result = spawnSync(
  process.execPath,
  [
    require.resolve('dotenv-cli/cli.js'),
    '-e',
    envPath,
    '--',
    require.resolve('webpack/bin/webpack.js'),
    '--mode',
    'production',
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status == null ? 1 : result.status);

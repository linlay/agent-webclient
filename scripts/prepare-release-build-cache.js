const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CACHE_SCHEMA_VERSION = 1;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) {
      fail('usage: prepare-release-build-cache.js --source <repo> --build <cache-workspace>');
    }
    values[key.slice(2)] = value;
  }
  if (!values.source || !values.build) {
    fail('usage: prepare-release-build-cache.js --source <repo> --build <cache-workspace>');
  }
  return values;
}

function assertSafeRoots(sourceRoot, buildRoot) {
  const parsedBuildRoot = path.parse(buildRoot).root;
  if (
    buildRoot === parsedBuildRoot ||
    buildRoot === sourceRoot ||
    buildRoot.startsWith(`${sourceRoot}${path.sep}`) ||
    sourceRoot.startsWith(`${buildRoot}${path.sep}`)
  ) {
    fail(`release cache workspace must be separate from the source repository: ${buildRoot}`);
  }
}

function requireFile(filePath) {
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    fail(`required release input is missing: ${filePath}`);
  }
}

function requireDirectory(directoryPath) {
  if (!fs.statSync(directoryPath, { throwIfNoEntry: false })?.isDirectory()) {
    fail(`required release input directory is missing: ${directoryPath}`);
  }
}

function copyFile(sourceRoot, buildRoot, relativePath, required = true) {
  const source = path.join(sourceRoot, relativePath);
  const destination = path.join(buildRoot, relativePath);
  if (!fs.existsSync(source)) {
    if (required) requireFile(source);
    fs.rmSync(destination, { force: true });
    return false;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return true;
}

function syncDirectory(sourceRoot, buildRoot, relativePath) {
  const source = path.join(sourceRoot, relativePath);
  requireDirectory(source);
  const destination = path.join(buildRoot, relativePath);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
}

function dependencyFingerprint(sourceRoot) {
  const hash = crypto.createHash('sha256');
  hash.update(`schema=${CACHE_SCHEMA_VERSION}\nnode=${process.version}\nplatform=${process.platform}\narch=${process.arch}\n`);
  for (const relativePath of ['package.json', 'package-lock.json', '.npmrc']) {
    const filePath = path.join(sourceRoot, relativePath);
    hash.update(`${relativePath}\0`);
    if (fs.existsSync(filePath)) hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function readMarker(markerPath) {
  try {
    return JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch {
    return null;
  }
}

function installDependencies(buildRoot, hasLockfile) {
  const npmArgs = hasLockfile
    ? ['ci', '--prefer-offline', '--no-audit', '--no-fund']
    : ['install', '--no-package-lock', '--prefer-offline', '--no-audit', '--no-fund'];
  const npmCliCandidates = [
    process.env.npm_execpath,
    path.resolve(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  ].filter(Boolean);
  const npmCli = npmCliCandidates.find((candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isFile());
  const command = npmCli ? process.execPath : 'npm';
  const args = npmCli ? [npmCli, ...npmArgs] : npmArgs;
  const result = spawnSync(command, args, {
    cwd: buildRoot,
    env: process.env,
    stdio: 'inherit',
    shell: !npmCli && process.platform === 'win32',
  });
  if (result.error) fail(`failed to start npm: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status || 1);
}

function prepareWorkspace(sourceRoot, buildRoot) {
  assertSafeRoots(sourceRoot, buildRoot);
  for (const relativePath of [
    'package.json',
    'webpack.config.js',
    'tsconfig.json',
    'postcss.config.js',
    '.env.example',
    'scripts/check-agent-webclient-contract.js',
    'scripts/check-feature-boundaries.js',
  ]) {
    requireFile(path.join(sourceRoot, relativePath));
  }

  fs.mkdirSync(buildRoot, { recursive: true });
  for (const relativePath of [
    'package.json',
    'webpack.config.js',
    'tsconfig.json',
    'postcss.config.js',
    '.env.example',
    'scripts/check-agent-webclient-contract.js',
    'scripts/check-feature-boundaries.js',
  ]) {
    copyFile(sourceRoot, buildRoot, relativePath);
  }
  const hasLockfile = copyFile(sourceRoot, buildRoot, 'package-lock.json', false);
  copyFile(sourceRoot, buildRoot, '.npmrc', false);
  if (!copyFile(sourceRoot, buildRoot, '.env', false)) {
    fs.copyFileSync(path.join(buildRoot, '.env.example'), path.join(buildRoot, '.env'));
  }
  syncDirectory(sourceRoot, buildRoot, 'public');
  syncDirectory(sourceRoot, buildRoot, 'src');

  const fingerprint = dependencyFingerprint(sourceRoot);
  const markerPath = path.join(buildRoot, '.agent-webclient-dependencies.json');
  const marker = readMarker(markerPath);
  const nodeModules = path.join(buildRoot, 'node_modules');
  if (marker?.fingerprint === fingerprint && fs.statSync(nodeModules, { throwIfNoEntry: false })?.isDirectory()) {
    process.stdout.write(`[release-cache] dependency cache hit ${fingerprint.slice(0, 12)}\n`);
    return;
  }

  process.stdout.write(`[release-cache] dependency cache miss ${fingerprint.slice(0, 12)}\n`);
  fs.rmSync(markerPath, { force: true });
  fs.rmSync(nodeModules, { recursive: true, force: true });
  installDependencies(buildRoot, hasLockfile);
  const temporaryMarkerPath = `${markerPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryMarkerPath, `${JSON.stringify({ fingerprint }, null, 2)}\n`);
  fs.renameSync(temporaryMarkerPath, markerPath);
}

const args = parseArgs(process.argv.slice(2));
prepareWorkspace(path.resolve(args.source), path.resolve(args.build));

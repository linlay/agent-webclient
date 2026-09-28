import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function writeFixtureFile(root: string, relativePath: string, content: string): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function createReleaseSource(root: string, sourceValue: string): void {
  const manifest = {
    name: 'release-cache-fixture',
    version: '1.0.0',
    private: true,
  };
  const lock = {
    name: manifest.name,
    version: manifest.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': manifest,
    },
  };
  writeFixtureFile(root, 'package.json', `${JSON.stringify(manifest, null, 2)}\n`);
  writeFixtureFile(root, 'package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
  writeFixtureFile(root, 'webpack.config.js', 'module.exports = {};\n');
  writeFixtureFile(root, 'tsconfig.json', '{}\n');
  writeFixtureFile(root, 'postcss.config.js', 'module.exports = {};\n');
  writeFixtureFile(root, '.env.example', 'EXAMPLE=true\n');
  writeFixtureFile(root, 'public/index.html', '<main></main>\n');
  writeFixtureFile(root, 'src/value.ts', `export const value = ${JSON.stringify(sourceValue)};\n`);
  writeFixtureFile(root, 'scripts/check-agent-webclient-contract.js', '\n');
  writeFixtureFile(root, 'scripts/check-feature-boundaries.js', '\n');
}

function prepareReleaseWorkspace(source: string, build: string) {
  const script = resolve(__dirname, '../scripts/prepare-release-build-cache.js');
  return spawnSync(process.execPath, [script, '--source', source, '--build', build], {
    encoding: 'utf8',
  });
}

describe('release build workspace cache', () => {
  it('reuses installed dependencies while refreshing copied sources', () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-webclient-release-cache-'));
    const source = join(root, 'source');
    const build = join(root, 'build');

    try {
      createReleaseSource(source, 'first');
      const first = prepareReleaseWorkspace(source, build);
      expect({ status: first.status, stderr: first.stderr }).toEqual({ status: 0, stderr: '' });

      const sentinel = join(build, 'node_modules/cache-sentinel.txt');
      writeFixtureFile(build, 'node_modules/cache-sentinel.txt', 'preserved\n');
      writeFixtureFile(source, 'src/value.ts', 'export const value = "second";\n');

      const second = prepareReleaseWorkspace(source, build);
      expect({ status: second.status, stderr: second.stderr }).toEqual({ status: 0, stderr: '' });
      expect(readFileSync(sentinel, 'utf8')).toBe('preserved\n');
      expect(readFileSync(join(build, 'src/value.ts'), 'utf8')).toContain('second');
      expect(second.stdout).toContain('[release-cache] dependency cache hit');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('removes optional dependency inputs that no longer exist in the source repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'agent-webclient-release-cache-'));
    const source = join(root, 'source');
    const build = join(root, 'build');

    try {
      createReleaseSource(source, 'first');
      writeFixtureFile(source, '.npmrc', 'audit=false\n');
      const first = prepareReleaseWorkspace(source, build);
      expect(first.status).toBe(0);

      unlinkSync(join(source, 'package-lock.json'));
      unlinkSync(join(source, '.npmrc'));
      const second = prepareReleaseWorkspace(source, build);
      expect(second.status).toBe(0);
      expect(existsSync(join(build, 'package-lock.json'))).toBe(false);
      expect(existsSync(join(build, '.npmrc'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

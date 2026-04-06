#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

function findWorkspaceRoot(startDir) {
  let currentDir = path.resolve(startDir);
  const { root } = path.parse(currentDir);

  while (true) {
    if (fs.existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }
    if (currentDir === root) {
      return null;
    }
    currentDir = path.dirname(currentDir);
  }
}

function getPlatformExecutablePath(platform = process.platform) {
  switch (platform) {
    case 'darwin':
    case 'mas':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'freebsd':
    case 'linux':
    case 'openbsd':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      throw new Error(`Unsupported platform for Electron binary check: ${platform}`);
  }
}

function resolveElectronPackageDir(projectRoot) {
  const packageJsonPath = require.resolve('electron/package.json', {
    paths: [projectRoot],
  });
  const realPackageJsonPath = fs.realpathSync(packageJsonPath);
  return {
    packageJsonPath: realPackageJsonPath,
    packageDir: path.dirname(realPackageJsonPath),
  };
}

function buildRepairCommands(options) {
  const workspaceRoot = options.workspaceRoot || options.projectRoot;
  const workspaceTarget = path.resolve(workspaceRoot);
  const projectTarget = path.resolve(options.projectRoot);
  const packageName = options.packageName || 'agent-webclient';
  const rebuildCommand = `pnpm --dir ${JSON.stringify(workspaceTarget)} --filter ${packageName} rebuild electron`;
  const installScriptPath = path.join(options.packageDir, 'install.js');
  const installCommand = `node ${JSON.stringify(installScriptPath)}`;
  const restartCommand = `pnpm --dir ${JSON.stringify(projectTarget)} run start:electron`;
  return {
    rebuildCommand,
    installCommand,
    restartCommand,
  };
}

function validateElectronInstall(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const packageName = options.packageName || 'agent-webclient';
  const workspaceRoot = findWorkspaceRoot(projectRoot);

  let resolvedPackage;
  try {
    resolvedPackage = resolveElectronPackageDir(projectRoot);
  } catch (error) {
    return {
      ok: false,
      projectRoot,
      workspaceRoot,
      packageName,
      missingKind: 'package',
      message: `Cannot resolve electron/package.json from ${projectRoot}: ${error.message}`,
    };
  }

  const { packageDir, packageJsonPath } = resolvedPackage;
  const pathFile = path.join(packageDir, 'path.txt');
  const distDir = process.env.ELECTRON_OVERRIDE_DIST_PATH
    ? path.resolve(process.env.ELECTRON_OVERRIDE_DIST_PATH)
    : path.join(packageDir, 'dist');

  const repair = buildRepairCommands({
    workspaceRoot,
    projectRoot,
    packageName,
    packageDir,
  });

  if (!fs.existsSync(pathFile)) {
    return {
      ok: false,
      projectRoot,
      workspaceRoot,
      packageName,
      packageDir,
      packageJsonPath,
      pathFile,
      distDir,
      missingKind: 'path.txt',
      message: `Electron package is missing path.txt at ${pathFile}. This usually means electron postinstall did not finish successfully.`,
      ...repair,
    };
  }

  const executableRelativePath = String(fs.readFileSync(pathFile, 'utf8') || '').trim();
  const effectiveRelativePath = executableRelativePath || getPlatformExecutablePath();
  const executablePath = path.join(distDir, effectiveRelativePath);

  if (!fs.existsSync(executablePath)) {
    return {
      ok: false,
      projectRoot,
      workspaceRoot,
      packageName,
      packageDir,
      packageJsonPath,
      pathFile,
      distDir,
      executableRelativePath: effectiveRelativePath,
      executablePath,
      missingKind: 'binary',
      message: `Electron package is missing the runtime binary at ${executablePath}.`,
      ...repair,
    };
  }

  return {
    ok: true,
    projectRoot,
    workspaceRoot,
    packageName,
    packageDir,
    packageJsonPath,
    pathFile,
    distDir,
    executableRelativePath: effectiveRelativePath,
    executablePath,
    rebuildCommand: repair.rebuildCommand,
    installCommand: repair.installCommand,
    restartCommand: repair.restartCommand,
  };
}

function formatFailureMessage(result) {
  const lines = [
    '[electron-check] Electron runtime is not installed correctly.',
    `[electron-check] ${result.message}`,
  ];

  if (result.packageDir) {
    lines.push(`[electron-check] Resolved electron package: ${result.packageDir}`);
  }

  if (result.pathFile) {
    lines.push(`[electron-check] Expected path file: ${result.pathFile}`);
  }

  if (result.executablePath) {
    lines.push(`[electron-check] Expected executable: ${result.executablePath}`);
  } else if (result.distDir) {
    lines.push(`[electron-check] Expected runtime directory: ${result.distDir}`);
  }

  lines.push('[electron-check] Repair steps:');
  lines.push(`[electron-check] 1. Run: ${result.rebuildCommand}`);
  lines.push('[electron-check] 2. Verify electron/path.txt and electron/dist were created under the resolved package path.');
  lines.push(`[electron-check] 3. Retry: ${result.restartCommand}`);
  lines.push(`[electron-check] If rebuild still does not create the binary, run: ${result.installCommand}`);
  lines.push('[electron-check] Do not use `pnpm run install` here. The monorepo root install script is recursive and can loop.');

  return `${lines.join('\n')}\n`;
}

function assertElectronInstall(options = {}) {
  const result = validateElectronInstall(options);
  if (!result.ok) {
    const error = new Error(formatFailureMessage(result));
    error.code = 'ELECTRON_INSTALL_INVALID';
    error.details = result;
    throw error;
  }
  return result;
}

if (require.main === module) {
  try {
    const result = assertElectronInstall({
      projectRoot: process.cwd(),
    });
    process.stdout.write(
      `[electron-check] Electron runtime OK: ${result.executablePath}${os.EOL}`,
    );
  } catch (error) {
    process.stderr.write(String(error.message || error));
    process.exit(1);
  }
}

module.exports = {
  assertElectronInstall,
  buildRepairCommands,
  findWorkspaceRoot,
  formatFailureMessage,
  getPlatformExecutablePath,
  validateElectronInstall,
};

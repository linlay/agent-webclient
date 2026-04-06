#!/usr/bin/env node

const { spawn } = require('child_process');
const { assertElectronInstall } = require('./check-electron-install');

const port = String(process.env.PORT || '11948').trim() || '11948';
const devServerUrl = String(
  process.env.AGENT_WEBCLIENT_ELECTRON_DEV_SERVER_URL || `http://127.0.0.1:${port}`,
).trim();

try {
  assertElectronInstall({
    packageName: 'agent-webclient',
    projectRoot: process.cwd(),
  });
} catch (error) {
  process.stderr.write(String(error.message || error));
  process.exit(1);
}

function runNodeScript(args, options = {}) {
  return spawn(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    ...options,
  });
}

function terminate(childProcess) {
  if (childProcess && !childProcess.killed) {
    childProcess.kill('SIGTERM');
  }
}

const build = runNodeScript(['./node_modules/typescript/bin/tsc', '-p', 'tsconfig.electron.json'], {
  cwd: process.cwd(),
});

build.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code == null ? 1 : code);
    return;
  }

  const webServer = spawn(/^win/i.test(process.platform) ? 'npm.cmd' : 'npm', ['run', 'start:web'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  const waitForServer = runNodeScript(['./node_modules/wait-on/bin/wait-on', `http-get://127.0.0.1:${port}`], {
    env: process.env,
  });

  const cleanup = () => {
    terminate(waitForServer);
    terminate(webServer);
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });

  webServer.on('exit', (webCode) => {
    if (webCode !== 0) {
      terminate(waitForServer);
      process.exit(webCode == null ? 1 : webCode);
    }
  });

  waitForServer.on('exit', (waitCode) => {
    if (waitCode !== 0) {
      cleanup();
      process.exit(waitCode == null ? 1 : waitCode);
      return;
    }

    const electron = runNodeScript(['./node_modules/electron/cli.js', 'dist-electron/main.js'], {
      env: {
        ...process.env,
        AGENT_WEBCLIENT_ELECTRON_DEV_SERVER_URL: devServerUrl,
      },
    });

    electron.on('exit', (electronCode) => {
      cleanup();
      process.exit(electronCode == null ? 0 : electronCode);
    });
  });
});

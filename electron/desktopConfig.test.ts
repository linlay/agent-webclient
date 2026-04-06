import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  DesktopConfigError,
  getDesktopConfigPath,
  parseDesktopConfig,
  resolveDesktopConfig,
} from './desktopConfig';

describe('desktopConfig', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-webclient-config-'));
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('prefers environment variables when both base URLs are set', () => {
    const resolved = resolveDesktopConfig({
      env: {
        BASE_URL: 'http://runner.example.com/',
        VOICE_BASE_URL: 'https://voice.example.com/',
      },
      userDataPath: tempDir,
    });

    expect(resolved).toEqual({
      config: {
        baseUrl: 'http://runner.example.com',
        voiceBaseUrl: 'https://voice.example.com',
      },
      source: 'env',
      configPath: null,
    });
  });

  it('falls back to the user data desktop config file', () => {
    fs.writeFileSync(
      getDesktopConfigPath(tempDir),
      JSON.stringify({
        baseUrl: 'http://runner.example.com',
        voiceBaseUrl: 'http://voice.example.com',
      }),
      'utf8',
    );

    const resolved = resolveDesktopConfig({
      env: {},
      userDataPath: tempDir,
    });

    expect(resolved.source).toBe('file');
    expect(resolved.config).toEqual({
      baseUrl: 'http://runner.example.com',
      voiceBaseUrl: 'http://voice.example.com',
    });
  });

  it('uses AGENT_WEBCLIENT_DESKTOP_CONFIG when provided', () => {
    const externalConfigPath = path.join(tempDir, 'external.json');
    fs.writeFileSync(
      externalConfigPath,
      JSON.stringify({
        baseUrl: 'https://runner.example.com',
        voiceBaseUrl: 'https://voice.example.com',
      }),
      'utf8',
    );

    const resolved = resolveDesktopConfig({
      env: {
        AGENT_WEBCLIENT_DESKTOP_CONFIG: externalConfigPath,
      },
      userDataPath: tempDir,
    });

    expect(resolved.configPath).toBe(externalConfigPath);
    expect(resolved.config.baseUrl).toBe('https://runner.example.com');
  });

  it('writes an example file and throws when the config is missing', () => {
    expect(() =>
      resolveDesktopConfig({
        env: {},
        userDataPath: tempDir,
      }),
    ).toThrow(DesktopConfigError);

    expect(fs.existsSync(path.join(tempDir, 'desktop.config.example.json'))).toBe(true);
  });

  it('throws when only one environment variable is provided', () => {
    expect(() =>
      resolveDesktopConfig({
        env: {
          BASE_URL: 'http://runner.example.com',
        },
        userDataPath: tempDir,
      }),
    ).toThrow('BASE_URL and VOICE_BASE_URL must both be set');
  });

  it('rejects invalid desktop config values', () => {
    expect(() =>
      parseDesktopConfig({
        baseUrl: 'ws://runner.example.com',
        voiceBaseUrl: 'http://voice.example.com',
      }),
    ).toThrow('baseUrl must use http:// or https://');
  });
});

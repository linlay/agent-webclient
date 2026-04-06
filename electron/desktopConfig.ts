import fs from 'fs';
import path from 'path';

export interface DesktopConfig {
  baseUrl: string;
  voiceBaseUrl: string;
}

export class DesktopConfigError extends Error {
  name = 'DesktopConfigError';
  configPath: string;
  examplePath: string;

  constructor(message: string, details: { configPath: string; examplePath: string }) {
    super(message);
    this.configPath = details.configPath;
    this.examplePath = details.examplePath;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

function trimEnvValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBaseUrl(label: string, value: unknown): string {
  const rawValue = typeof value === 'string' ? value.trim() : '';
  if (!rawValue) {
    throw new Error(`${label} is required`);
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch (error) {
    throw new Error(`${label} must be a valid URL: ${(error as Error).message}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must use http:// or https://`);
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function getDesktopConfigPath(userDataPath: string): string {
  return path.join(userDataPath, 'desktop.config.json');
}

export function getDesktopConfigExamplePath(userDataPath: string): string {
  return path.join(userDataPath, 'desktop.config.example.json');
}

export function createDesktopConfigExample(): string {
  return `${JSON.stringify(
    {
      baseUrl: 'http://host:11949',
      voiceBaseUrl: 'http://host:11953',
    },
    null,
    2,
  )}\n`;
}

export function parseDesktopConfig(value: unknown, sourceLabel = 'desktop.config.json'): DesktopConfig {
  if (!isObjectRecord(value)) {
    throw new Error(`${sourceLabel} must be a JSON object`);
  }

  return {
    baseUrl: normalizeBaseUrl('baseUrl', value.baseUrl),
    voiceBaseUrl: normalizeBaseUrl('voiceBaseUrl', value.voiceBaseUrl),
  };
}

export function writeDesktopConfigExample(userDataPath: string): string {
  const examplePath = getDesktopConfigExamplePath(userDataPath);
  fs.mkdirSync(userDataPath, { recursive: true });
  if (!fs.existsSync(examplePath)) {
    fs.writeFileSync(examplePath, createDesktopConfigExample(), 'utf8');
  }
  return examplePath;
}

function readDesktopConfigFile(configPath: string): DesktopConfig {
  const rawText = fs.readFileSync(configPath, 'utf8');
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`invalid JSON: ${(error as Error).message}`);
  }
  return parseDesktopConfig(json, configPath);
}

export function resolveDesktopConfig(options: {
  env?: NodeJS.ProcessEnv;
  userDataPath: string;
}): { config: DesktopConfig; source: 'env' | 'file'; configPath: string | null } {
  const env = options.env ?? process.env;
  const userDataPath = options.userDataPath;
  const configPath = getDesktopConfigPath(userDataPath);

  const envBaseUrl = trimEnvValue(env.BASE_URL);
  const envVoiceBaseUrl = trimEnvValue(env.VOICE_BASE_URL);
  if (envBaseUrl || envVoiceBaseUrl) {
    if (!(envBaseUrl && envVoiceBaseUrl)) {
      const examplePath = writeDesktopConfigExample(userDataPath);
      throw new DesktopConfigError(
        `BASE_URL and VOICE_BASE_URL must both be set for Electron desktop mode. Otherwise create ${configPath}. Example written to ${examplePath}.`,
        {
          configPath,
          examplePath,
        },
      );
    }

    return {
      config: {
        baseUrl: normalizeBaseUrl('BASE_URL', envBaseUrl),
        voiceBaseUrl: normalizeBaseUrl('VOICE_BASE_URL', envVoiceBaseUrl),
      },
      source: 'env',
      configPath: null,
    };
  }

  const explicitConfigPath = trimEnvValue(env.AGENT_WEBCLIENT_DESKTOP_CONFIG);
  if (explicitConfigPath) {
    try {
      return {
        config: readDesktopConfigFile(explicitConfigPath),
        source: 'file',
        configPath: explicitConfigPath,
      };
    } catch (error) {
      const examplePath = writeDesktopConfigExample(userDataPath);
      throw new DesktopConfigError(
        `Failed to read AGENT_WEBCLIENT_DESKTOP_CONFIG at ${explicitConfigPath}: ${(error as Error).message}. Example written to ${examplePath}.`,
        {
          configPath: explicitConfigPath,
          examplePath,
        },
      );
    }
  }

  if (!fs.existsSync(configPath)) {
    const examplePath = writeDesktopConfigExample(userDataPath);
    throw new DesktopConfigError(
      `Desktop config not found. Create ${configPath} or set BASE_URL and VOICE_BASE_URL. Example written to ${examplePath}.`,
      {
        configPath,
        examplePath,
      },
    );
  }

  try {
    return {
      config: readDesktopConfigFile(configPath),
      source: 'file',
      configPath,
    };
  } catch (error) {
    const examplePath = writeDesktopConfigExample(userDataPath);
    throw new DesktopConfigError(
      `Failed to read desktop config at ${configPath}: ${(error as Error).message}. Example written to ${examplePath}.`,
      {
        configPath,
        examplePath,
      },
    );
  }
}

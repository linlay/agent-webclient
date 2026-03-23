interface ToolEvent {
  toolId?: string;
  toolParams?: Record<string, unknown>;
  arguments?: unknown;
}

export interface FrontendToolParamsResult {
  found: boolean;
  source: string;
  params: Record<string, unknown> | null;
  error?: string;
}

export function parseFrontendToolParams(event: ToolEvent): FrontendToolParamsResult {
  const fromToolParams = event?.toolParams;
  if (fromToolParams && typeof fromToolParams === 'object' && !Array.isArray(fromToolParams)) {
    return {
      found: true,
      source: 'toolParams',
      params: fromToolParams,
    };
  }

  const fromArguments = event?.arguments;
  if (fromArguments && typeof fromArguments === 'object' && !Array.isArray(fromArguments)) {
    return {
      found: true,
      source: 'arguments',
      params: fromArguments as Record<string, unknown>,
    };
  }

  if (typeof fromArguments === 'string') {
    try {
      const parsed = JSON.parse(fromArguments);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {
          found: true,
          source: 'arguments',
          params: parsed as Record<string, unknown>,
        };
      }
    } catch (error) {
      return {
        found: false,
        source: 'arguments',
        params: null,
        error: (error as Error).message,
      };
    }
  }

  return {
    found: false,
    source: '',
    params: null,
  };
}

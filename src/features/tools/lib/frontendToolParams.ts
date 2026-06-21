interface ToolEvent {
  toolId?: string;
  toolParams?: Record<string, unknown>;
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

  return {
    found: false,
    source: '',
    params: null,
  };
}

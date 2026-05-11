export interface GeneratedScript {
  title: string;
  shots: {
    shot_type: 'A-Roll' | 'B-Roll';
    script_text: string;
    visual_description: string;
    order_index: number;
    duration_seconds: number;
  }[];
}

export interface ScriptRequest {
  topic: string;
  product?: string;
  audience: string;
  tone: string;
  durationSeconds: number;
}

export interface QuotaSnapshot {
  statusType: 'ok' | 'temporary' | 'daily';
  used: number;
  remaining: number;
  limit: number;
  resetHours: number | null;
  retryMinutes: number | null;
  note: string | null;
}

export interface GeneratedScriptResponse {
  result: GeneratedScript;
  quota: QuotaSnapshot;
}

const ANONYMOUS_USER_STORAGE_KEY = 'tudtor-anonymous-user-id';

function getAnonymousUserId() {
  if (typeof window === 'undefined') {
    return 'server-render';
  }

  const existing = window.localStorage.getItem(ANONYMOUS_USER_STORAGE_KEY);
  if (existing) return existing;

  const next = window.crypto?.randomUUID?.().replace(/-/g, '') || `user_${Math.random().toString(36).slice(2, 18)}`;
  window.localStorage.setItem(ANONYMOUS_USER_STORAGE_KEY, next);
  return next;
}

async function parseResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || 'Request failed.');
    (error as any).quota = data?.quota || null;
    throw error;
  }
  return data;
}

export async function fetchQuotaStatus(): Promise<QuotaSnapshot> {
  const userId = getAnonymousUserId();
  const response = await fetch(`/api/preproduction?anonymousUserId=${encodeURIComponent(userId)}`);
  const data = await parseResponse(response);
  return data.quota;
}

export async function generateScript(request: ScriptRequest): Promise<GeneratedScriptResponse> {
  const response = await fetch('/api/preproduction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'brief',
      anonymousUserId: getAnonymousUserId(),
      request,
    }),
  });
  return parseResponse(response);
}

export async function breakScriptIntoShots(scriptText: string, durationSeconds: number): Promise<GeneratedScriptResponse> {
  const response = await fetch('/api/preproduction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'script',
      anonymousUserId: getAnonymousUserId(),
      scriptText,
      durationSeconds,
    }),
  });
  return parseResponse(response);
}

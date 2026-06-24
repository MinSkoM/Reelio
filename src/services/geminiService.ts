export interface GeneratedScript {
  title: string;
  caption: string;
  shots: {
    shot_type: 'A-Roll' | 'B-Roll';
    script_text: string;
    on_screen_text?: string;
    visual_description: string;
    order_index: number;
    duration_seconds: number;
  }[];
}

export interface ScriptRequest {
  topic: string;
  product?: string;
  platform?: string;
  usp?: string;
  audience: string;
  tone: string;
  cta?: string;
  durationSeconds: number;
}

async function parseResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Request failed.');
  }
  return data;
}

export async function generateScript(request: ScriptRequest): Promise<GeneratedScript> {
  const response = await fetch('/api/preproduction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'brief', request }),
  });
  const data = await parseResponse(response);
  return data.result;
}

export async function breakScriptIntoShots(scriptText: string, durationSeconds: number): Promise<GeneratedScript> {
  const response = await fetch('/api/preproduction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'script', scriptText, durationSeconds }),
  });
  const data = await parseResponse(response);
  return data.result;
}

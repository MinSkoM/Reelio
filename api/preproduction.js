import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const DAILY_REQUEST_LIMIT = Number(process.env.DAILY_REQUEST_LIMIT_PER_USER || 5);
const TIME_ZONE = 'Asia/Bangkok';

const scriptSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    caption: { type: Type.STRING },
    shots: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          shot_type: {
            type: Type.STRING,
            enum: ['A-Roll', 'B-Roll'],
          },
          script_text: { type: Type.STRING },
          visual_description: { type: Type.STRING },
          order_index: { type: Type.INTEGER },
          duration_seconds: { type: Type.INTEGER },
        },
        required: ['shot_type', 'script_text', 'visual_description', 'order_index', 'duration_seconds'],
      },
    },
  },
  required: ['title', 'caption', 'shots'],
};

function getTodayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
}

function getHoursUntilReset() {
  const now = new Date();
  const nextReset = new Date(now);
  nextReset.setHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((nextReset.getTime() - now.getTime()) / (1000 * 60 * 60)));
}

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase admin env is missing. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing on the server.');
  }
  return new GoogleGenAI({ apiKey });
}

function normalizeScript(raw) {
  const shots = Array.isArray(raw?.shots) ? raw.shots : [];
  if (!raw?.title || shots.length === 0) {
    throw new Error('AI returned incomplete shot data.');
  }

  return {
    title: String(raw.title),
    caption: String(raw?.caption || raw?.title || '').trim(),
    shots: shots
      .map((shot, index) => ({
        shot_type: shot?.shot_type === 'B-Roll' ? 'B-Roll' : 'A-Roll',
        script_text: String(shot?.script_text || '').trim(),
        visual_description: String(shot?.visual_description || '').trim(),
        order_index: Number.isFinite(shot?.order_index) ? shot.order_index : index + 1,
        duration_seconds: Number.isFinite(shot?.duration_seconds) ? shot.duration_seconds : 3,
      }))
      .filter((shot) => shot.script_text || shot.visual_description),
  };
}

function extractJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('AI response was not valid JSON.');
  }

  try {
    return JSON.parse(match[0]);
  } catch {
    throw new Error('AI response JSON could not be parsed.');
  }
}

async function generateWithPrompt(contents, emptyMessage) {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents,
    config: {
      responseMimeType: 'application/json',
      responseSchema: scriptSchema,
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error(emptyMessage);
  }

  return normalizeScript(extractJson(text));
}

async function generateScript(request) {
  const { topic, product, audience, tone, durationSeconds } = request;
  const productContext = product?.trim() ? `สิ่งที่ต้องโฟกัสคือ ${product}. ` : '';

  return generateWithPrompt(
    `ช่วยสร้างสคริปต์วิดีโอสั้นสมัยใหม่เกี่ยวกับ ${topic}. ${productContext}กลุ่มคนดูคือ ${audience}. ใช้โทน ${tone}. ความยาวรวมประมาณ ${durationSeconds} วินาที. ให้วางโครงแบบ TikTok, Reels หรือ Shorts ที่ดูทันสมัย: เปิดด้วย hook ที่ดึงความสนใจ, ตัดถี่, และรักษาจังหวะให้ไหลต่อเนื่อง. แตกเนื้อหาออกเป็นช็อตถ่ายจริงตามประเด็นที่สำคัญที่สุด เช่น hook, ประโยคขายหลัก, จุดเด่นของสินค้า, ช่วงพิสูจน์, reaction, transition และ payoff. ใช้ A-Roll สำหรับช่วงพูดหน้ากล้อง และ B-Roll สำหรับช็อต insert, close-up, มือ, สภาพแวดล้อม, หน้าจอ, เดโม, ตัวหนังสือบนจอ หรือภาพที่ช่วยเน้นความหมาย. คืนค่า shot_type เป็น A-Roll หรือ B-Roll เท่านั้น. ในทุกช็อตให้มี script_text เป็นสิ่งที่พูดหรือใจความของช็อต และ visual_description เป็นคำอธิบายภาษาไทยว่าในช็อตนั้นต้องถ่ายอะไรให้ชัดเจนและถ่ายได้จริง เช่น มุมกล้อง, วัตถุ, การขยับมือ, หน้าจอ, สีหน้า, การเคลื่อนไหว หรือรายละเอียดของสถานที่. ใส่ duration_seconds ให้ทุกช็อต, ให้เวลารวมใกล้เคียง ${durationSeconds} วินาที, และเน้นช็อตที่สั้น กระชับ จังหวะดี มากกว่าการพูดยาวต่อเนื่อง. เพิ่ม caption ภาษาไทยสำหรับโพสต์โซเชียล 1 ชุดที่พร้อมคัดลอกไปใช้ได้เลย ความยาวกระชับ อ่านลื่น และเข้ากับคลิปนี้. คำตอบทั้งหมด โดยเฉพาะ visual_description และ caption ต้องเป็นภาษาไทยที่เข้าใจง่าย.`,
    'No script generated from AI.',
  );
}

async function breakScriptIntoShots(scriptText, durationSeconds) {
  return generateWithPrompt(
    `ช่วยแตกสคริปต์ต่อไปนี้ให้เป็นช็อตถ่ายวิดีโอสั้นแบบ TikTok, Reels หรือ Shorts ที่ดูทันสมัย. เริ่มจากดูว่าสคริปต์นี้เน้นอะไรจริง ๆ แล้วค่อยแยกช็อตตามจุดเน้นเหล่านั้น แทนการตัดเป็นท่อนยาว ๆ ตรง ๆ. ให้เวลารวมใกล้เคียง ${durationSeconds} วินาที. ใช้จังหวะตัดที่ถี่ขึ้น, pace ที่แน่นขึ้น, และมีความหลากหลายของภาพมากขึ้น. ในแต่ละช็อตให้ตัดสินใจว่าเป็น A-Roll (พูดหน้ากล้อง) หรือ B-Roll (ช็อต insert / ภาพประกอบ). ใช้ B-Roll เมื่อประโยคนั้นจะสื่อสารได้ดีกว่าด้วยภาพ เช่น close-up, เดโม, reaction, รายละเอียดของวัตถุ, มือกำลังทำอะไร, ภาพบรรยากาศ, ตัวหนังสือบนจอ หรือหลักฐานประกอบ. ในทุกช็อตให้มี script_text เป็นสิ่งที่พูดหรือใจความ และ visual_description เป็นคำอธิบายภาษาไทยว่าในช็อตนั้นต้องถ่ายอะไรแบบชัดเจน ถ่ายได้จริง และไม่กว้างเกินไป. ใส่ duration_seconds ให้ทุกช็อต. เน้นช็อตสั้น กระชับ และมีแรงส่ง เว้นแต่บางช่วงจำเป็นต้องยาวขึ้นจริง. เพิ่ม caption ภาษาไทยสำหรับโพสต์โซเชียล 1 ชุดที่พร้อมคัดลอกไปใช้ได้เลย ความยาวกระชับ อ่านลื่น และเข้ากับคลิปนี้. คำตอบทั้งหมด โดยเฉพาะ visual_description และ caption ต้องเป็นภาษาไทย. สคริปต์: ${scriptText}`,
    'No shot list generated from script.',
  );
}

function makeQuota(statusType, used, limit, extra = {}) {
  return {
    statusType,
    used,
    remaining: Math.max(0, limit - used),
    limit,
    resetHours: statusType === 'daily' ? getHoursUntilReset() : null,
    retryMinutes: null,
    note: null,
    ...extra,
  };
}

function parseGeminiQuotaError(error, currentUsage) {
  const rawMessage = error?.message || String(error || '');
  if (!rawMessage.includes('RESOURCE_EXHAUSTED') && !rawMessage.includes('Quota exceeded')) {
    return null;
  }

  const quotaValueMatch = rawMessage.match(/"quotaValue":"(\d+)"/i) || rawMessage.match(/limit:\s*(\d+)/i);
  const quotaValue = quotaValueMatch ? Number(quotaValueMatch[1]) : currentUsage.limit;
  const isDailyQuota =
    rawMessage.includes('GenerateRequestsPerDayPerProjectPerModel-FreeTier') ||
    rawMessage.includes('PerDay') ||
    rawMessage.includes('daily');

  if (isDailyQuota) {
    return makeQuota('daily', quotaValue, quotaValue, {
      note: 'โควต้ารวมของ Gemini key วันนี้หมดแล้ว ทุกคนจะต้องรอรอบรีเซ็ตของคีย์นี้',
    });
  }

  const retryMatch =
    rawMessage.match(/Please retry in\s+([0-9.]+)s/i) ||
    rawMessage.match(/"retryDelay":"(\d+)s"/i);
  const retryMinutes = retryMatch ? Math.max(1, Math.ceil(Number(retryMatch[1]) / 60)) : null;

  return makeQuota('temporary', currentUsage.used, currentUsage.limit, {
    retryMinutes,
    note: retryMinutes ? `ลองใหม่อีกครั้งในประมาณ ${retryMinutes} นาที` : 'ลองใหม่อีกครั้งในอีกสักครู่',
  });
}

function getAnonymousUserId(input) {
  const bodyValue = typeof input?.body?.anonymousUserId === 'string' ? input.body.anonymousUserId : '';
  const queryValue = typeof input?.query?.anonymousUserId === 'string' ? input.query.anonymousUserId : '';
  const candidate = bodyValue || queryValue;
  if (!candidate || !/^[a-zA-Z0-9_-]{8,80}$/.test(candidate)) {
    return null;
  }
  return candidate;
}

async function getUsage(admin, userId) {
  const todayKey = getTodayKey();
  const { data, error } = await admin
    .from('anonymous_quota_usage')
    .select('request_count')
    .eq('user_key', userId)
    .eq('usage_date', todayKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    date: todayKey,
    used: Number(data?.request_count || 0),
    limit: DAILY_REQUEST_LIMIT,
  };
}

async function saveUsage(admin, userId, usage) {
  const { error } = await admin.from('anonymous_quota_usage').upsert(
    {
      user_key: userId,
      usage_date: usage.date,
      request_count: usage.used,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_key,usage_date' },
  );

  if (error) {
    throw error;
  }
}

export async function handlePreproductionRequest(input) {
  const userId = getAnonymousUserId(input);
  if (!userId) {
    return { status: 400, body: { error: 'anonymousUserId is required.' } };
  }

  const admin = getSupabaseAdmin();
  const usage = await getUsage(admin, userId);

  if (input.method === 'GET') {
    return { status: 200, body: { quota: makeQuota('ok', usage.used, usage.limit) } };
  }

  if (input.method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed.' } };
  }

  if (usage.used >= usage.limit) {
    return {
      status: 429,
      body: {
        error: 'Daily quota reached for this user.',
        quota: makeQuota('daily', usage.limit, usage.limit),
      },
    };
  }

  const mode = input.body?.mode;
  let result;

  if (mode === 'brief') {
    result = await generateScript(input.body?.request || {});
  } else if (mode === 'script') {
    result = await breakScriptIntoShots(String(input.body?.scriptText || ''), Number(input.body?.durationSeconds || 30));
  } else {
    return { status: 400, body: { error: 'Unsupported mode.' } };
  }

  const nextUsage = { ...usage, used: usage.used + 1 };
  await saveUsage(admin, userId, nextUsage);

  return {
    status: 200,
    body: {
      result,
      quota: makeQuota('ok', nextUsage.used, nextUsage.limit),
    },
  };
}

export default async function handler(req, res) {
  try {
    const result = await handlePreproductionRequest({
      method: req.method,
      body: req.body || {},
      query: req.query || {},
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Pre-production API error:', error);

    const quota = parseGeminiQuotaError(error, { used: 0, limit: DAILY_REQUEST_LIMIT });
    if (quota) {
      return res.status(429).json({ error: error.message || 'Quota exceeded.', quota });
    }

    return res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
}

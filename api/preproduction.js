import { GoogleGenAI, Type } from '@google/genai';

function parseRetryDelaySeconds(error) {
  const msg = error?.message || String(error);
  const match = msg.match(/Please retry in\s+([0-9.]+)s/i) || msg.match(/"retryDelay":"(\d+)s"/i);
  return match ? Math.ceil(Number(match[1])) : null;
}

function isResourceExhausted(error) {
  return (error?.message || String(error)).includes('RESOURCE_EXHAUSTED');
}

function isDailyRateLimit(error) {
  const msg = error?.message || String(error);
  return msg.includes('RESOURCE_EXHAUSTED') && (msg.includes('PerDay') || msg.includes('GenerateRequestsPerDay'));
}

function isTokenRateLimit(error) {
  const msg = error?.message || String(error);
  return msg.includes('RESOURCE_EXHAUSTED') && (msg.includes('Token') || msg.includes('TPM') || msg.includes('PerMinutePerProject-token'));
}

function hoursUntilPacificMidnight() {
  const now = new Date();
  const pacificNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const pacificMidnight = new Date(pacificNow);
  pacificMidnight.setHours(24, 0, 0, 0);
  return Math.max(1, Math.round((pacificMidnight - pacificNow) / (1000 * 60 * 60)));
}

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
          on_screen_text: { type: Type.STRING },
          visual_description: { type: Type.STRING },
          order_index: { type: Type.INTEGER },
          duration_seconds: { type: Type.INTEGER },
        },
        required: ['shot_type', 'script_text', 'on_screen_text', 'visual_description', 'order_index', 'duration_seconds'],
      },
    },
  },
  required: ['title', 'caption', 'shots'],
};

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
        on_screen_text: String(shot?.on_screen_text || '').trim(),
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
  const { topic, product, platform, usp, audience, tone, cta, durationSeconds } = request;
  const productContext = product?.trim() ? `สิ่งที่ต้องโฟกัสคือ ${product}. ` : '';
  const platformContext = platform?.trim() ? platform.trim() : 'TikTok, Instagram Reels หรือ YouTube Shorts';
  const uspContext = usp?.trim() ? usp.trim() : 'เลือกจุดเด่นที่เหมาะกับหัวข้อเอง';
  const ctaContext = cta?.trim() ? cta.trim() : 'CTA ที่เข้ากับเนื้อหาคลิปจริง';

  return generateWithPrompt(
    `คุณคือ AI ครีเอทีฟและผู้กำกับวิดีโอสั้นระดับมืออาชีพ ช่วยสร้างสคริปต์วิดีโอสั้นที่ดูทันสมัย จังหวะกระชับ และคัดเลือกเนื้อหาที่ตรงประเด็นที่สุดเพื่อนำข้อมูลไปพาร์สแสดงผลบนหน้าเว็บตามเงื่อนไขต่อไปนี้อย่างเคร่งครัด \\n\\n[ข้อมูลบริบท]\\n- หัวข้อ: ${topic}\\n- แพลตฟอร์มปลายทาง: ${platformContext}\\n- บริบทเพิ่มเติม: ${productContext}\\n- จุดเด่นที่อยากเน้น (USP): ${uspContext}\\n- กลุ่มคนดูคือ: ${audience}\\n- ใช้โทน: ${tone}\\n- สิ่งที่อยากให้คนดูทำ (CTA): ${ctaContext}\\n- ความยาวรวมประมาณ: ${durationSeconds} วินาที\\n\\n[กฎเหล็กเรื่องภาษา Unisex]\\n- ต้องใช้ภาษาไทยที่เป็นกลางทางเพศ 100% หลีกเลี่ยงคำลงท้ายหรือสรรพนามที่ระบุเพศชัดเจน (ห้ามใช้คำว่า ครับ, ค่ะ, ผม, หนู เด็ดขาด) ให้ใช้คำสรรพนามกลางๆ เช่น "เรา", "คุณ", "ทุกคน", "เพื่อนๆ" หรือออกแบบรูปประโยคให้ลื่นไหลเป็นธรรมชาติโดยไม่ต้องพึ่งคำลงท้าย\\n\\n[โครงสร้างวิดีโอสำหรับแพลตฟอร์ม ${platformContext}]\\n- เปิดด้วย Hook ที่ดึงความสนใจทันทีใน 1-3 วินาทีแรก, เน้นการตัดถี่ (Fast-paced), รักษาจังหวะให้ไหลต่อเนื่อง และจบด้วย CTA: ${ctaContext} ให้ชัดเจนและเข้ากับเนื้อหาคลิปจริง\\n- ต้องใช้ USP "${uspContext}" เป็นแกนขายหรือประเด็นพิสูจน์หลักของคลิป โดยไม่ยัดเยียดเกินไป\\n- แตกเนื้อหาออกเป็นช็อตตามประเด็นสำคัญ เช่น hook, ประโยคขายหลัก, จุดเด่นของสินค้า, ช่วงพิสูจน์/เดโม, reaction, transition และ payoff\\n\\n[รูปแบบผลลัพธ์ที่ต้องแสดงซ้ำในแต่ละช็อต]\\nช็อตที่ 1\\nshot_type: [ระบุเป็น A-Roll สำหรับพูดหน้ากล้อง หรือ B-Roll สำหรับภาพแทรก/Close-up/เดโม/มือ/หน้าจอ เท่านั้น]\\nduration_seconds: [ตัวเลขจำนวนวินาทีของช็อตนี้ โดยเวลารวมทั้งหมดต้องใกล้เคียง ${durationSeconds} วินาที]\\nscript_text: [สิ่งที่พูดหรือใจความของช็อต เป็นภาษาไทย Unisex]\\non_screen_text: [ข้อความสั้นๆ 1-2 บรรทัดที่จะขึ้นบนวิดีโอเพื่อเน้นความหมาย หากช็อตนั้นไม่ควรมีข้อความให้คืนเป็น string ว่าง ""]\\nvisual_description: [คำอธิบายภาษาไทยระบุให้ชัดเจนว่าในช็อตนั้นต้องถ่ายอะไร เช่น มุมกล้อง, วัตถุ, การขยับมือ, หน้าจอ, สีหน้า]\\n\\nช็อตที่ 2... (เขียนต่อจนจบสคริปต์)\\n\\n--------------------\\n\\ncaption: [แคปชั่นภาษาไทยสำหรับโพสต์ลง ${platformContext} 1 ชุดที่พร้อมคัดลอกไปใช้ได้เลย ความยาวกระชับ อ่านลื่นไหล และเข้ากับคลิปนี้ พร้อมแฮชแท็กที่เกี่ยวข้อง]`,
    'No script generated from AI.',
  );
}

async function breakScriptIntoShots(scriptText, durationSeconds) {
  return generateWithPrompt(
    `ช่วยแตกสคริปต์ต่อไปนี้ให้เป็นช็อตถ่ายวิดีโอสั้นแบบ TikTok, Reels หรือ Shorts ที่ดูทันสมัย. เริ่มจากดูว่าสคริปต์นี้เน้นอะไรจริง ๆ แล้วค่อยแยกช็อตตามจุดเน้นเหล่านั้น แทนการตัดเป็นท่อนยาว ๆ ตรง ๆ. ให้เวลารวมใกล้เคียง ${durationSeconds} วินาที. ใช้จังหวะตัดที่ถี่ขึ้น, pace ที่แน่นขึ้น, และมีความหลากหลายของภาพมากขึ้น. ในแต่ละช็อตให้ตัดสินใจว่าเป็น A-Roll (พูดหน้ากล้อง) หรือ B-Roll (ช็อต insert / ภาพประกอบ). ใช้ B-Roll เมื่อประโยคนั้นจะสื่อสารได้ดีกว่าด้วยภาพ เช่น close-up, เดโม, reaction, รายละเอียดของวัตถุ, มือกำลังทำอะไร, ภาพบรรยากาศ, ตัวหนังสือบนจอ หรือหลักฐานประกอบ. ในทุกช็อตให้มี script_text เป็นสิ่งที่พูดหรือใจความ, on_screen_text เป็นข้อความสั้น ๆ สำคัญที่ควรขึ้นบนวิดีโอหรือใช้เป็น subtitle overlay เท่านั้น ไม่ใช่คำอธิบายช็อต และ visual_description เป็นคำอธิบายภาษาไทยว่าในช็อตนั้นต้องถ่ายอะไรแบบชัดเจน ถ่ายได้จริง และไม่กว้างเกินไป. ให้ on_screen_text สั้น กระชับ อ่านจบบนจอใน 1-2 บรรทัด และถ้าช็อตนั้นไม่ควรมีข้อความบนวิดีโอให้คืนเป็น string ว่าง. ใส่ duration_seconds ให้ทุกช็อต. เน้นช็อตสั้น กระชับ และมีแรงส่ง เว้นแต่บางช่วงจำเป็นต้องยาวขึ้นจริง. ตอนท้ายต้องมี CTA ที่ชัดเจนเสมอ เช่น ชวนคอมเมนต์ ชวนติดตาม หรือชวนทักมาถามต่อ โดยให้เข้ากับเนื้อหาคลิปนั้นจริง ๆ. เพิ่ม caption ภาษาไทยสำหรับโพสต์โซเชียล 1 ชุดที่พร้อมคัดลอกไปใช้ได้เลย ความยาวกระชับ อ่านลื่น และเข้ากับคลิปนี้. คำตอบทั้งหมด โดยเฉพาะ on_screen_text, visual_description และ caption ต้องเป็นภาษาไทย. สคริปต์: ${scriptText}`,
    'No shot list generated from script.',
  );
}

export async function handlePreproductionRequest(input) {
  if (input.method === 'GET') {
    return { status: 200, body: {} };
  }

  if (input.method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed.' } };
  }

  const mode = input.body?.mode;

  try {
    let result;
    if (mode === 'brief') {
      result = await generateScript(input.body?.request || {});
    } else if (mode === 'script') {
      result = await breakScriptIntoShots(String(input.body?.scriptText || ''), Number(input.body?.durationSeconds || 30));
    } else {
      return { status: 400, body: { error: 'Unsupported mode.' } };
    }
    return { status: 200, body: { result } };
  } catch (error) {
    if (!isResourceExhausted(error)) throw error;

    if (isDailyRateLimit(error)) {
      const hours = hoursUntilPacificMidnight();
      return {
        status: 429,
        body: {
          error: 'rate_limit',
          kind: 'daily',
          message: `โควต้ารายวันของ Gemini key หมดแล้ว (ฟรีเทียร์ได้ 250 req/day) จะรีเซ็ตอีกประมาณ ${hours} ชั่วโมง (เที่ยงคืน Pacific time)`,
        },
      };
    }

    const retrySeconds = parseRetryDelaySeconds(error) ?? 60;

    if (isTokenRateLimit(error)) {
      return {
        status: 429,
        body: {
          error: 'rate_limit',
          kind: 'token',
          retryAfterMs: retrySeconds * 1000,
          message: `ส่ง token เกิน limit ต่อนาที ระบบจะลองใหม่ใน ${retrySeconds} วินาที`,
        },
      };
    }

    return {
      status: 429,
      body: {
        error: 'rate_limit',
        kind: 'rpm',
        retryAfterMs: retrySeconds * 1000,
        message: `เกิน limit ${retrySeconds} req/min ระบบจะลองใหม่ใน ${retrySeconds} วินาที`,
      },
    };
  }
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
    return res.status(500).json({ error: 'server_error', message: error.message || 'Unexpected server error.' });
  }
}

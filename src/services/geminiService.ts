import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface GeneratedScript {
  title: string;
  shots: {
    shot_type: 'A-Roll' | 'B-Roll';
    script_text: string;
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

export async function generateScript(request: ScriptRequest): Promise<GeneratedScript> {
  const { topic, product, audience, tone, durationSeconds } = request;
  const productContext = product?.trim()
    ? `The main product or thing to focus on is ${product}. `
    : '';

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Create a short-form video script about ${topic}. ${productContext}The audience is ${audience}. Use a ${tone.toLowerCase()} tone. Keep the full video around ${durationSeconds} seconds. Split every beat into either A-Roll (person speaking directly to camera) or B-Roll (insert shots or visuals with voiceover). Return only A-Roll or B-Roll for shot_type. Include duration_seconds for each shot, and make the total duration feel close to ${durationSeconds} seconds overall. Keep the wording simple and practical for filming.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          shots: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                shot_type: {
                  type: Type.STRING,
                  enum: ['A-Roll', 'B-Roll']
                },
                script_text: { type: Type.STRING },
                order_index: { type: Type.INTEGER },
                duration_seconds: { type: Type.INTEGER }
              },
              required: ['shot_type', 'script_text', 'order_index', 'duration_seconds']
            }
          }
        },
        required: ['title', 'shots']
      }
    }
  });

  if (!response.text) {
    throw new Error("No script generated from AI.");
  }

  return JSON.parse(response.text) as GeneratedScript;
}

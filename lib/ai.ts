import OpenAI from "openai"

const client = new OpenAI({
  apiKey: process.env.SARVAM_API_KEY!,
  baseURL: "https://api.sarvam.ai/v2",
})

export async function complete(system: string, user: string): Promise<string> {
  const res = await client.chat.completions.create({
    model: "sarvam-105b",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  })
  return res.choices[0]?.message?.content ?? ""
}

/** Tolerant JSON parse — LLMs wrap JSON in markdown fences and drop fields. */
export function safeParse<T = Record<string, unknown>>(raw: string): T | null {
  try {
    return JSON.parse(raw.replace(/```json\n?|```/g, "").trim()) as T
  } catch {
    return null
  }
}
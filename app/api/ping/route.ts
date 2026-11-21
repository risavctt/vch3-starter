import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { complete } from "@/lib/ai"

export async function GET() {
  const { data, error } = await supabaseAdmin.from("items").select("*").limit(5)
  if (error) return NextResponse.json({ step: "db", error: error.message }, { status: 500 })

  let ai = ""
  try {
    ai = await complete("Reply in exactly three words.", "Describe a database.")
  } catch (e) {
    return NextResponse.json({ step: "ai", error: String(e), rows: data.length }, { status: 500 })
  }

  return NextResponse.json({ rows: data.length, ai })
}
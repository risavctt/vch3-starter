import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { complete, safeParse } from "@/lib/ai"
import { boq } from "@/lib/data"

const system = `You extract structured data from a construction vendor's waterproofing quotation.

Return JSON ONLY. No commentary, no markdown fences, no explanation. Output exactly this shape:

{
  "vendor_name": string,
  "lines": [ { "sl": number, "unit": string|null, "rate": number|null } ],
  "gst_percent": number|null,
  "gst_included": boolean,
  "payment_terms": string|null,
  "validity_days": number|null,
  "warranty_years": number|null,
  "escalation_clause": boolean,
  "quoted_total": number|null,
  "exclusions": string[]
}

Rules:
- The BOQ has 7 numbered lines. Match the vendor's items to sl 1-7 by description, not by the vendor's own numbering.
- "unit" is exactly what the vendor wrote (SQFT, SQM, RMT etc), NOT what it should be. Do not correct it.
- Use null for anything not stated. Never guess a number.
- escalation_clause is true if any term lets the rate change after the work order is issued (e.g. chemical price increases).
- quoted_total is the total the vendor printed, or null if they printed none.
- Return the rate per unit, not the line amount.

Report only what is printed in the document. You are a transcriber, not an estimator.

Vendors often quote the SAME rate for every line. If the RATE column shows the same
value on all lines, that is normal and correct — report that same value on every line.
Never vary rates to make them look more plausible.

Never infer, estimate or calculate a rate. If a rate is not printed in the RATE column
for a line, return null for that line.

Read rates from the RATE column, never from an AMOUNT or VALUE column.

If the document contains no printed grand total, return null for quoted_total. Do not
add up the lines yourself.

If a field is not stated anywhere in the document, return null. Never substitute a
typical or reasonable value.`

const boqText = boq
  .map((b) => `sl ${b.sl}: ${b.desc} [expected unit ${b.unit}]`)
  .join("\n")

async function extract(vendorName: string, quoteText: string) {
  const user = `BOQ lines to match against:
${boqText}

Vendor name: ${vendorName}

Vendor quotation text:
${quoteText}`

  const raw = await complete(system, user)
  console.log("[extract] raw model response:\n", raw)
  return raw
}

export async function POST(req: Request) {
  const { vendorName, quoteText } = await req.json()

  let raw: string
  try {
    raw = await extract(vendorName, quoteText)
  } catch (error) {
    return NextResponse.json({ ok: false, step: "ai", error: String(error) }, { status: 500 })
  }

  const data = safeParse(raw)
  if (!data) {
    return NextResponse.json({ ok: false, step: "parse", raw }, { status: 500 })
  }

  return NextResponse.json({ ok: true, data })
}

export async function GET(req: Request) {
  const vendor = new URL(req.url).searchParams.get("vendor") || "bajrang"
  const file = path.join(process.cwd(), "quotes", `${vendor}.txt`)

  let quoteText: string
  try {
    quoteText = fs.readFileSync(file, "utf-8")
  } catch {
    return NextResponse.json({ ok: false, error: "quote file not found" }, { status: 404 })
  }

  let raw: string
  try {
    raw = await extract(vendor, quoteText)
  } catch (error) {
    return NextResponse.json({ ok: false, step: "ai", error: String(error) }, { status: 500 })
  }

  const data = safeParse(raw)
  if (!data) {
    return NextResponse.json({ ok: false, step: "parse", raw }, { status: 500 })
  }

  return NextResponse.json({ ok: true, data })
}

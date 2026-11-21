import { boq } from "@/lib/data"

export type ExtractedQuote = {
  vendor_name: string
  lines: { sl: number; unit: string | null; rate: number | null }[]
  gst_percent: number | null
  gst_included: boolean
  payment_terms: string | null
  validity_days: number | null
  warranty_years: number | null
  escalation_clause: boolean
  quoted_total: number | null
  exclusions: string[]
}

export type Flag = {
  vendor: string
  severity: "high" | "medium"
  text: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Normalize units for comparison so "SQM." vs "SQM" isn't a false mismatch.
const normUnit = (u: string | null) =>
  (u ?? "").trim().toUpperCase().replace(/\.+$/, "")

export function priceQuote(q: ExtractedQuote) {
  const lines = boq.map((b) => {
    const match = q.lines.find((l) => l.sl === b.sl)
    const rate = match?.rate ?? null
    const quotedUnit = match?.unit ?? null
    const amount = rate === null ? null : round2(rate * b.qty)
    return {
      sl: b.sl,
      desc: b.desc,
      boqUnit: b.unit,
      qty: b.qty,
      quotedUnit,
      rate,
      amount,
    }
  })

  const subtotal = round2(
    lines.reduce((sum, l) => sum + (l.amount ?? 0), 0)
  )
  const gstAmount = q.gst_included
    ? 0
    : round2(subtotal * ((q.gst_percent ?? 0) / 100))
  const grandTotal = round2(subtotal + gstAmount)

  return {
    vendor: q.vendor_name,
    lines,
    subtotal,
    gstAmount,
    grandTotal,
    quotedTotal: q.quoted_total,
  }
}

export function flagQuote(
  q: ExtractedQuote,
  priced: ReturnType<typeof priceQuote>
): Flag[] {
  const flags: Flag[] = []
  const vendor = q.vendor_name

  for (const l of priced.lines) {
    if (l.quotedUnit !== null && normUnit(l.quotedUnit) !== normUnit(l.boqUnit)) {
      flags.push({
        vendor,
        severity: "high",
        text: `Line ${l.sl} quoted in ${l.quotedUnit}, BOQ says ${l.boqUnit} — not comparable`,
      })
    }
  }

  if (q.escalation_clause) {
    flags.push({
      vendor,
      severity: "high",
      text: "Rate can change after the work order — not a firm price",
    })
  }

  for (const l of priced.lines) {
    if (l.rate === null) {
      flags.push({ vendor, severity: "medium", text: `Line ${l.sl} has no rate` })
    }
  }

  if (q.quoted_total === null) {
    flags.push({
      vendor,
      severity: "medium",
      text: "No total provided — computed from line items",
    })
  }

  const terms = (q.payment_terms ?? "").toLowerCase()
  if (
    q.payment_terms === null ||
    terms.includes("discussion") ||
    terms.includes("to be decided") ||
    terms.includes("will fix")
  ) {
    flags.push({ vendor, severity: "medium", text: "Payment terms not agreed" })
  }

  if (
    q.quoted_total !== null &&
    Math.abs(q.quoted_total - priced.subtotal) > 1
  ) {
    flags.push({
      vendor,
      severity: "medium",
      text: "Vendor's printed total disagrees with their own line items",
    })
  }

  return flags
}

export function rank(priced: ReturnType<typeof priceQuote>[]) {
  return [...priced]
    .sort((a, b) => a.grandTotal - b.grandTotal)
    .map((p, i) => ({ ...p, rank: i + 1 }))
}

export function formatINR(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
}

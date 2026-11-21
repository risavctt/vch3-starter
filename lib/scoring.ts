import { boq } from "@/lib/data"

export type ExtractedQuote = {
  vendor_name: string
  lines: { sl: number; unit: string | null; rate: number | null; qty: number | null }[]
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
  // Vendor says GST extra but didn't state the rate -> apply statutory 18%.
  const gstAssumed = !q.gst_included && q.gst_percent === null
  const gstPercent = q.gst_included ? 0 : q.gst_percent ?? 18
  const gstAmount = round2(subtotal * (gstPercent / 100))
  const grandTotal = round2(subtotal + gstAmount)

  return {
    vendor: q.vendor_name,
    lines,
    subtotal,
    gstAmount,
    gstAssumed,
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

  const qtyMismatches = boq
    .map((b) => {
      const line = q.lines.find((l) => l.sl === b.sl)
      const vendorQty = line?.qty ?? null
      const off =
        vendorQty !== null && b.qty > 0 && Math.abs(vendorQty - b.qty) / b.qty > 0.01
      return off ? { sl: b.sl, vendorQty: vendorQty as number, unit: line?.unit ?? b.unit, boqQty: b.qty } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const fmtQty = (n: number) => n.toLocaleString("en-IN")

  if (qtyMismatches.length > 2) {
    const e = qtyMismatches[0]
    flags.push({
      vendor,
      severity: "high",
      text: `Quoted against different quantities on ${qtyMismatches.length} of 7 lines — vendor has priced a different scope (e.g. line ${e.sl}: ${fmtQty(e.vendorQty)} vs BOQ ${fmtQty(e.boqQty)})`,
    })
  } else {
    for (const m of qtyMismatches) {
      flags.push({
        vendor,
        severity: "high",
        text: `Line ${m.sl} quoted against ${m.vendorQty} ${m.unit}, BOQ says ${m.boqQty} — vendor has priced a different scope`,
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

  if (priced.gstAssumed) {
    flags.push({
      vendor,
      severity: "medium",
      text: "GST rate not stated — 18% assumed. Vendor says rates exclude GST 'as per Government norms'.",
    })
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

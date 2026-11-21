"use client"

import { Fragment, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { bajrang, shyama, purvyakruti } from "@/lib/samples"
import { project, boq } from "@/lib/data"
import {
  priceQuote,
  flagQuote,
  rank,
  recommend,
  formatINR,
  type ExtractedQuote,
  type Flag,
} from "@/lib/scoring"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Priced = ReturnType<typeof priceQuote>
type Result = {
  name: string
  priced: Priced
  flags: Flag[]
  rank: number
}

export default function Home() {
  const [vendors, setVendors] = useState([
    { name: "", text: "" },
    { name: "", text: "" },
    { name: "", text: "" },
  ])
  const [loading, setLoading] = useState(false)
  const [buildCount, setBuildCount] = useState(0)
  const [results, setResults] = useState<Result[]>([])
  const [errors, setErrors] = useState<string[]>([])

  function setVendor(i: number, key: "name" | "text", value: string) {
    setVendors((v) => v.map((x, j) => (j === i ? { ...x, [key]: value } : x)))
  }

  function loadSamples() {
    setVendors([
      { name: "Bajrang Construction & Waterproofing", text: bajrang },
      { name: "Shyama's Prevention & Cure Co.", text: shyama },
      { name: "Purvyakruti Sales & Services Pvt. Ltd.", text: purvyakruti },
    ])
  }

  function resetAll() {
    setVendors([
      { name: "", text: "" },
      { name: "", text: "" },
      { name: "", text: "" },
    ])
    setResults([])
    setErrors([])
  }

  async function build() {
    const filled = vendors.filter((v) => v.text.trim())
    if (!filled.length) {
      alert("No data present — paste a vendor quote or load the samples first.")
      return
    }
    setLoading(true)
    setBuildCount(filled.length)
    setErrors([])
    // Keep previous results visible while rebuilding.

    const errs: string[] = []
    const settled = await Promise.all(
      filled.map(async (v) => {
        const name = v.name.trim() || "Unnamed vendor"
        try {
          const res = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vendorName: name, quoteText: v.text }),
          })
          const json = await res.json()
          if (!json.ok) {
            errs.push(`${name}: extraction failed (${json.step ?? "error"})`)
            return null
          }
          const q = json.data as ExtractedQuote
          q.vendor_name = name
          const priced = priceQuote(q)
          const flags = flagQuote(q, priced)
          return { name, priced, flags }
        } catch (e) {
          errs.push(`${name}: ${String(e)}`)
          return null
        }
      })
    )

    const ok = settled.filter((r): r is NonNullable<typeof r> => r !== null)
    const ranked = rank(ok.map((r) => r.priced))
    const withRank: Result[] = ok.map((r) => ({
      ...r,
      rank: ranked.find((x) => x.vendor === r.priced.vendor)?.rank ?? 0,
    }))

    setResults(withRank)
    setErrors(errs)
    setLoading(false)
  }

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="space-y-1 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm">
            <Sparkles className="size-5" />
          </div>
          <h1 className="font-sans text-3xl font-semibold tracking-tight">BidCompare AI</h1>
        </div>
        <p className="text-muted-foreground">
          {project.client} · {project.name}
        </p>
        <p className="text-sm text-muted-foreground max-w-3xl pt-1">
          Reads vendor quotes in any format, normalises them against the BOQ, and shows
          what a manual comparative misses.
        </p>
      </header>

      <div className="space-y-1">
        <Button variant="secondary" onClick={loadSamples} disabled={loading}>
          Load sample quotes
        </Button>
        <p className="text-sm text-muted-foreground">
          No quotes handy? Load three real vendor quotes for this package.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {vendors.map((v, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle>Vendor {i + 1}</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Vendor name"
                value={v.name}
                disabled={loading}
                onChange={(e) => setVendor(i, "name", e.target.value)}
              />
              <Textarea
                rows={8}
                placeholder="Paste the vendor's quote text…"
                value={v.text}
                disabled={loading}
                onChange={(e) => setVendor(i, "text", e.target.value)}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Button onClick={build} disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            {loading ? "Reading quotes…" : "Build comparative"}
          </Button>
          {errors.map((e, i) => (
            <span key={i} className="text-sm text-destructive">
              {e}
            </span>
          ))}
          <Button
            variant="destructive"
            onClick={resetAll}
            disabled={loading}
            className="ml-auto"
          >
            Reset
          </Button>
        </div>
        {loading && (
          <p className="text-sm text-muted-foreground">
            Extracting line items, units, tax and terms from {buildCount}{" "}
            {buildCount === 1 ? "quote" : "quotes"}
          </p>
        )}
      </div>

      {results.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Paste vendor quotes above, or load the samples, to build the comparative.
        </div>
      )}

      {results.length > 0 && <Comparative results={results} />}
    </main>
  )
}

function Comparative({ results }: { results: Result[] }) {
  const money = (n: number | null) => (n === null ? "—" : formatINR(n))
  const rankBadge = (r: number): "success" | "secondary" =>
    r === 1 ? "success" : "secondary"
  const rec = recommend(
    results.map((r) => ({ ...r.priced, rank: r.rank })),
    results.flatMap((r) => r.flags)
  )

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="h-5 w-1.5 rounded-full bg-primary" />
          Comparative statement
        </h2>
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SL</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  {results.map((r) => (
                    <TableHead key={r.name} className="text-right" colSpan={2}>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-foreground font-semibold">{r.name}</span>
                        <Badge variant={rankBadge(r.rank)}>Rank {r.rank}</Badge>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  <TableHead />
                  <TableHead />
                  <TableHead />
                  <TableHead />
                  {results.map((r) => (
                    <Fragment key={r.name}>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </Fragment>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {boq.map((b, rowIdx) => {
                  const cells = results.map((r) => r.priced.lines[rowIdx])
                  const rates = cells
                    .map((c) => c.rate)
                    .filter((x): x is number => x !== null)
                  const lowest = rates.length ? Math.min(...rates) : null
                  return (
                    <TableRow key={b.sl} className={rowIdx % 2 === 1 ? "bg-muted/30" : ""}>
                      <TableCell>{b.sl}</TableCell>
                      <TableCell className="min-w-[14rem]">{b.desc}</TableCell>
                      <TableCell>{b.unit}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {b.qty.toLocaleString("en-IN")}
                      </TableCell>
                      {cells.map((c, i) => {
                        const isLowest = c.rate !== null && c.rate === lowest
                        const unitMismatch =
                          c.quotedUnit !== null &&
                          c.quotedUnit.trim().toUpperCase().replace(/\.+$/, "") !==
                            b.unit.toUpperCase()
                        return (
                          <Fragment key={i}>
                            <TableCell
                              className={
                                "text-right font-mono tabular-nums " +
                                (isLowest ? "bg-green-100 dark:bg-green-900/30 font-semibold" : "")
                              }
                            >
                              {c.rate === null ? "—" : c.rate}
                              {unitMismatch && (
                                <Badge variant="amber" className="ml-1">
                                  {c.quotedUnit}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono tabular-nums">
                              {money(c.amount)}
                            </TableCell>
                          </Fragment>
                        )
                      })}
                    </TableRow>
                  )
                })}

                <SummaryRow label="Subtotal" results={results} value={(r) => r.priced.subtotal} />
                <SummaryRow label="GST" results={results} value={(r) => r.priced.gstAmount} />
                <SummaryRow
                  label="Grand Total"
                  results={results}
                  value={(r) => r.priced.grandTotal}
                  bold
                />
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="h-5 w-1.5 rounded-full bg-amber-500" />
          Flags from the quotes
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {results.map((r) => (
            <Card key={r.name} className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{r.name}</span>
                  <Badge variant={rankBadge(r.rank)}>Rank {r.rank}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {r.flags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No flags.</p>
                ) : (
                  <ul className="space-y-2">
                    {r.flags.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Badge variant={f.severity === "high" ? "destructive" : "amber"}>
                          {f.severity}
                        </Badge>
                        <span>{f.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="h-5 w-1.5 rounded-full bg-green-600" />
          Recommendation
        </h2>
        <Card className="border-green-600/40 bg-green-50/60 dark:bg-green-950/20">
          <CardContent className="pt-4 space-y-3">
            <p className="text-lg font-bold">{rec.headline}</p>
            <ul className="space-y-1.5">
              {rec.reasons.map((reason, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  {reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function SummaryRow({
  label,
  results,
  value,
  bold,
}: {
  label: string
  results: Result[]
  value: (r: Result) => number
  bold?: boolean
}) {
  return (
    <TableRow className={bold ? "border-t-2 border-border" : ""}>
      <TableCell colSpan={4} className={"text-right " + (bold ? "font-semibold" : "font-medium")}>
        {label}
      </TableCell>
      {results.map((r) => (
        <TableCell
          key={r.name}
          colSpan={2}
          className={"text-right font-mono tabular-nums " + (bold ? "font-bold" : "")}
        >
          {formatINR(value(r))}
        </TableCell>
      ))}
    </TableRow>
  )
}

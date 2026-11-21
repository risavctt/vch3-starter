"use client"

import { Fragment, useState } from "react"
import { project, boq } from "@/lib/data"
import {
  priceQuote,
  flagQuote,
  rank,
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
  const [results, setResults] = useState<Result[]>([])
  const [errors, setErrors] = useState<string[]>([])

  function setVendor(i: number, key: "name" | "text", value: string) {
    setVendors((v) => v.map((x, j) => (j === i ? { ...x, [key]: value } : x)))
  }

  async function build() {
    const filled = vendors.filter((v) => v.text.trim())
    if (!filled.length) return
    setLoading(true)
    setErrors([])
    setResults([])

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
      <header className="space-y-1">
        <h1 className="font-sans text-2xl font-semibold">{project.name}</h1>
        <p className="text-muted-foreground">{project.client}</p>
        <p className="text-sm text-muted-foreground max-w-3xl pt-1">
          Reads vendor quotes in any format, normalises them against the BOQ, and shows
          what a manual comparative misses.
        </p>
      </header>

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
                onChange={(e) => setVendor(i, "name", e.target.value)}
              />
              <Textarea
                rows={8}
                placeholder="Paste the vendor's quote text…"
                value={v.text}
                onChange={(e) => setVendor(i, "text", e.target.value)}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={build} disabled={loading}>
          {loading ? "Building…" : "Build comparative"}
        </Button>
        {errors.map((e, i) => (
          <span key={i} className="text-sm text-destructive">
            {e}
          </span>
        ))}
      </div>

      {results.length > 0 && (
        <Comparative results={results} />
      )}
    </main>
  )
}

function Comparative({ results }: { results: Result[] }) {
  const money = (n: number | null) => (n === null ? "—" : formatINR(n))

  return (
    <div className="space-y-6">
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
                      <Badge variant={r.rank === 1 ? "default" : "secondary"}>
                        Rank {r.rank}
                      </Badge>
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
                  <TableRow key={b.sl}>
                    <TableCell>{b.sl}</TableCell>
                    <TableCell className="min-w-[14rem]">{b.desc}</TableCell>
                    <TableCell>{b.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">
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
                              "text-right tabular-nums " +
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
                          <TableCell className="text-right tabular-nums">
                            {money(c.amount)}
                          </TableCell>
                        </Fragment>
                      )
                    })}
                  </TableRow>
                )
              })}

              <SummaryRow
                label="Subtotal"
                results={results}
                value={(r) => r.priced.subtotal}
              />
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

      <div className="grid gap-4 md:grid-cols-3">
        {results.map((r) => (
          <Card key={r.name}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{r.name}</span>
                <Badge variant={r.rank === 1 ? "default" : "secondary"}>Rank {r.rank}</Badge>
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
          className={"text-right tabular-nums " + (bold ? "font-bold" : "")}
        >
          {formatINR(value(r))}
        </TableCell>
      ))}
    </TableRow>
  )
}

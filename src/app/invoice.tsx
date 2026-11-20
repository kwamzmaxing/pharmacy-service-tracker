import { renderToStaticMarkup } from "react-dom/server"
import { feeText, fmtDate, invStatus, money, qtyText, termsText, type Invoice } from "@/lib/model"

const Lines = ({ text }: { text: string }) => (
  <>
    {text.split("\n").map((l, i) => (
      <div key={i}>{l}</div>
    ))}
  </>
)

export function InvoiceDoc({ inv, logo }: { inv: Invoice; logo?: string }) {
  const f = inv.from, t = inv.to, pay = inv.pay
  const paid = invStatus(inv) === "paid"
  return (
    <div className="inv">
      <div className="mb-5 flex flex-col justify-between gap-5 border-b-2 border-foreground pb-4 sm:flex-row sm:items-start">
        <div>
          {logo && <img src={logo} alt="" className="mb-2 max-h-14 max-w-[180px] object-contain" />}
          <h3 className="font-display text-[26px] font-medium leading-tight">Invoice</h3>
          <div className="mt-0.5 font-semibold text-muted-foreground">{inv.number}</div>
          {paid && (
            <div className="mt-2 inline-block rounded-md border-2 border-brand-ink px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.08em] text-brand-ink">
              Paid {fmtDate(inv.paidDate)}
            </div>
          )}
        </div>
        <div className="text-[13px] sm:text-right">
          <div className="font-bold">{f.trading || f.name}</div>
          {f.trading && f.name && <div>{f.name}</div>}
          {f.address && <Lines text={f.address} />}
          {f.phone && <div>{f.phone}</div>}
          {f.email && <div>{f.email}</div>}
          {f.gphc && <div>GPhC no. {f.gphc}</div>}
        </div>
      </div>
      <div className="mb-5 grid gap-5 sm:grid-cols-[1fr_auto]">
        <div>
          <span className="k">Bill to</span>
          <div className="font-bold">{t.name || "—"}</div>
          {t.address && <Lines text={t.address} />}
          {t.email && <div>{t.email}</div>}
        </div>
        <div className="grid gap-2 sm:text-right">
          <div><span className="k">Invoice date</span>{fmtDate(inv.issued)}</div>
          <div><span className="k">Due date</span>{fmtDate(inv.due)}</div>
          <div><span className="k">Service period</span>{inv.period}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Service</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.name}</td>
                <td className="r num">{qtyText(l.qty, l.unit)}</td>
                <td className="r num">{feeText(l.fee, l.unit)}</td>
                <td className="r num">{money(l.amt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-10 text-[17px] font-bold">
        <span>Total due</span>
        <span className="num">{money(inv.total)}</span>
      </div>
      {(pay.sortCode || pay.accountNumber) && (
        <div className="mt-6 grid gap-0.5 rounded-xl border p-3.5 text-[13px]">
          <span className="k">Payment details</span>
          {pay.accountName && <div>Account name: <b>{pay.accountName}</b></div>}
          {pay.bankName && <div>Bank: {pay.bankName}</div>}
          {pay.sortCode && <div>Sort code: <b>{pay.sortCode}</b></div>}
          {pay.accountNumber && <div>Account number: <b>{pay.accountNumber}</b></div>}
          <div>Reference: <b>{inv.number}</b></div>
        </div>
      )}
      <p className="mt-3.5 text-xs text-muted-foreground">{termsText(inv.terms || "14th", inv.due)}</p>
    </div>
  )
}

/** A stand-alone HTML file of the invoice, always in light colours, ready to open and print. */
export function invoiceFile(inv: Invoice) {
  const css = [...document.querySelectorAll("style")].map((s) => s.textContent).join("\n")
  const body = renderToStaticMarkup(<InvoiceDoc inv={inv} />)
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
  return [
    '<!doctype html><html lang="en-GB" data-theme="light"><he' + "ad>",
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${esc(inv.number)}</title>`,
    '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">',
    `<style>${css}\nhtml,body{background:#fff}body::before{display:none}body{max-width:760px;margin:0 auto;padding:32px 20px}@page{margin:16mm}</style>`,
    "</he" + "ad><bo" + "dy>",
    body,
    "</bo" + "dy></html>",
  ].join("")
}

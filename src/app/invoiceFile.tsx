import { renderToStaticMarkup } from "react-dom/server"
import type { Invoice } from "@/lib/model"
import { InvoiceDoc } from "./invoice"

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

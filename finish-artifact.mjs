// Turn Parcel's bundle.html into the page fragment the Artifact tool publishes:
// no doctype/html/head/body of our own; our title, metas and fonts first (title within the first 8 KB).
import fs from "node:fs"
let html = fs.readFileSync("bundle.html", "utf8")
const sStart = html.indexOf("<script type=module")  >= 0 ? html.indexOf("<script type=module") : html.indexOf('<script type="module"')
const sEnd = html.lastIndexOf("</script>") + "</script>".length
if (sStart < 0 || sEnd < sStart) throw new Error("module script not found")
let markup = html.slice(0, sStart) + html.slice(sEnd)
const script = html.slice(sStart, sEnd)
markup = markup
  .replace(/<!doctype html>/i, "")
  .replace(/<\/?(html|head|body)\b[^>]*>/gi, "")
  .replace(/<meta charset[^>]*>/gi, "")
  .replace(/<meta name=["']?viewport[^>]*>/gi, "")
  .replace(/<meta name=["']?claude:viewport-fit-sides[^>]*>/gi, "")
  .replace(/<title>[\s\S]*?<\/title>/gi, "")
const out = [
  "<title>Pharmacy Service Tracker</title>",
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">',
  markup.trim(),
  script,
].join("\n")
fs.writeFileSync(process.argv[2] || "artifact.html", out)
console.log("artifact.html", (out.length / 1024).toFixed(0) + " KB; markup outside script:", markup.replace(/<style[\s\S]*?<\/style>/g, "[style]").trim().slice(0, 200))

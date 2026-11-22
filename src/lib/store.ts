/**
 * Save a file the page made (an invoice, a back-up, an export). Every download goes through here,
 * so a native app can replace just this function with its own file-saving or share sheet.
 * Installed iPhone apps can't download, so there the file goes to the share sheet instead.
 */
export async function saveFile(filename: string, data: string | Blob) {
  const blob = data instanceof Blob ? data : new Blob([data])
  const standaloneIOS = (navigator as { standalone?: boolean }).standalone === true
  if (standaloneIOS && typeof File !== "undefined" && navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" })
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return } catch { /* cancelled: fall back to a download */ }
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

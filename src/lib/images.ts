/** Shrink a photo or logo on the device before saving it: longest side ≤ max, JPEG (or PNG for logos). */
export async function shrinkImage(file: File, max = 1400, type: "image/jpeg" | "image/png" = "image/jpeg", quality = 0.72): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error("That file isn’t an image the browser can read."))
      i.src = url
    })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale))
    const c = document.createElement("canvas")
    c.width = w
    c.height = h
    const ctx = c.getContext("2d")!
    if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h) }
    ctx.drawImage(img, 0, 0, w, h)
    let out = c.toDataURL(type, quality)
    // keep receipts comfortably inside a single database document
    for (let q = quality - 0.12; out.length > 700_000 && q > 0.3 && type === "image/jpeg"; q -= 0.12) out = c.toDataURL(type, q)
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}

// "Add KASA.Rx to your home screen": a button where the browser offers one, steps for iPhone otherwise.
import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Panel } from "./bits"

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let saved: PromptEvent | null = null
if (typeof window !== "undefined") window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); saved = e as PromptEvent })

export function InstallApp() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(saved)
  const [installed, setInstalled] = useState(() => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true)
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); saved = e as PromptEvent; setPrompt(saved) }
    const done = () => setInstalled(true)
    window.addEventListener("beforeinstallprompt", on)
    window.addEventListener("appinstalled", done)
    return () => { window.removeEventListener("beforeinstallprompt", on); window.removeEventListener("appinstalled", done) }
  }, [])
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)

  return (
    <Panel title="Use KASA.Rx as an app">
      <div className="grid gap-3 text-[13.5px]">
        {installed ? (
          <p className="text-muted-foreground">KASA.Rx is installed on this device. It opens from your home screen and works without signal: changes save on the phone and go online when you’re back in range.</p>
        ) : (
          <>
            <p className="text-muted-foreground">Add KASA.Rx to your home screen to open it like an app. It works without signal too, handy in pharmacies with poor reception: changes save on your phone and go online when you’re back in range.</p>
            {prompt ? (
              <div><Button onClick={async () => { await prompt.prompt(); const r = await prompt.userChoice; if (r.outcome === "accepted") setInstalled(true); saved = null; setPrompt(null) }}><Download /> Install app</Button></div>
            ) : ios ? (
              <p>On iPhone or iPad: open this site in <b className="font-medium">Safari</b>, tap the <b className="font-medium">Share</b> button, then <b className="font-medium">Add to Home Screen</b>.</p>
            ) : (
              <p>In Chrome or Edge, use the install icon in the address bar, or the browser menu’s <b className="font-medium">Install app</b> or <b className="font-medium">Add to Home screen</b>.</p>
            )}
          </>
        )}
      </div>
    </Panel>
  )
}

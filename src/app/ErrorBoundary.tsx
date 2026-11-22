// If a page crashes, show a way out instead of a blank screen, and send a crash report.
import { Component, type ReactNode } from "react"
import { reportError } from "@/lib/errors"

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { reportError(error, "render") }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6 text-center text-foreground">
        <div className="max-w-sm">
          <h1 className="font-display text-[22px] font-medium">Something went wrong</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">Sorry, this page hit a problem. Your saved work is safe. A report has been sent so it can be fixed.</p>
          <button type="button" onClick={() => location.reload()} className="mt-5 rounded-full bg-primary px-6 py-2.5 text-[14px] font-medium text-primary-foreground">Reload</button>
        </div>
      </div>
    )
  }
}

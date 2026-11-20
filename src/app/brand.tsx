// The KASA.Rx brand: name, mark and wordmark, used everywhere the site names itself.
import { cn } from "@/lib/utils"

export const BRAND = "KASA.Rx"
export const TAGLINE = "The service tracker run by KASA"
export const CONTACT_EMAIL = "KASA.Scripts@gmail.com"
export const PRIVACY_URL = `${import.meta.env.BASE_URL}privacy.html`

/** The ℞ mark on graphite. */
export function Mark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <div aria-hidden className={cn("flex flex-none items-center justify-center rounded-lg bg-secondary font-display font-medium text-foreground", size === "lg" ? "size-11 text-[24px]" : "size-9 text-[20px]")}>℞</div>
  )
}

/** Mark + "KASA.Rx", with the tagline underneath when asked for. */
export function Wordmark({ size = "md", tagline = false, as: Tag = "span" }: { size?: "md" | "lg"; tagline?: boolean; as?: "span" | "h1" }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Mark size={size} />
      <span className="min-w-0 text-left">
        <Tag className={cn("block font-display font-medium leading-tight", size === "lg" ? "text-[20px]" : "text-[17px]")}>
          KASA<span className="text-brand-ink">.Rx</span>
        </Tag>
        {tagline && <span className="block truncate text-[12px] leading-tight text-muted-foreground">{TAGLINE}</span>}
      </span>
    </span>
  )
}

export function GoogleLogo({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
  )
}
export function MicrosoftLogo({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 23 23" className={className} aria-hidden><path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#7fba00" d="M12 1h10v10H12z"/><path fill="#00a4ef" d="M1 12h10v10H1z"/><path fill="#ffb900" d="M12 12h10v10H12z"/></svg>
  )
}

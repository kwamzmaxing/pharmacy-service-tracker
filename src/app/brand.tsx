// The KASA.Rx brand: name, mark and wordmark, used everywhere the site names itself.
import { cn } from "@/lib/utils"

export const BRAND = "KASA.Rx"
export const TAGLINE = "The service tracker run by KASA"
export const CONTACT_EMAIL = "KASA.Scripts@gmail.com"
export const PRIVACY_URL = `${import.meta.env.BASE_URL}privacy.html`

/** The KASA.Rx mark (navy and teal) on a light tile, so it reads well in light and dark mode. */
export function Mark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span aria-hidden className={cn("flex flex-none items-center justify-center rounded-lg bg-[#F4F4F2]", size === "lg" ? "size-11 p-1.5" : "size-9 p-[5px]")}>
      <img src={`${import.meta.env.BASE_URL}logo-mark.svg`} alt="" className="size-full" />
    </span>
  )
}

/** Mark + "KASA.Rx", with the tagline underneath when asked for. */
export function Wordmark({ size = "md", tagline = false, as: Tag = "span" }: { size?: "md" | "lg"; tagline?: boolean; as?: "span" | "h1" }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Mark size={size} />
      <span className="min-w-0 text-left">
        <Tag className={cn("block font-display font-medium leading-tight", size === "lg" ? "text-[20px]" : "text-[17px]")}>
          KASA<span className="text-brand-teal">.Rx</span>
        </Tag>
        {tagline && <span className="block truncate text-[12px] leading-tight text-muted-foreground">{TAGLINE}</span>}
      </span>
    </span>
  )
}

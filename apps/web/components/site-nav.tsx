import Link from "next/link";

const TABS = [
  { href: "/land", label: "Grundstücke" },
  { href: "/houses", label: "Häuser" },
  { href: "/cars", label: "Autos" },
  { href: "/compare", label: "Vergleich" },
];

/** Schlichte Bereichs-Navigation über allen Ansichten. */
export function SiteNav({ active }: { active: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-1">
      <Link
        href="/"
        className="mr-2 font-heading text-lg tracking-tight text-foreground hover:opacity-75"
      >
        Listing Radar
      </Link>
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${
            active === t.href
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

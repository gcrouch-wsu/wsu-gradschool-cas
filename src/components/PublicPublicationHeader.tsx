import Link from "next/link";
import { sanitizePublicHref, sanitizePublicImageSrc } from "@/lib/safe-url";

type Props = {
  title: string;
  subtitle: string;
  logoUrl: string | null;
  titleHref: string;
};

export function PublicPublicationHeader({ title, subtitle, logoUrl, titleHref }: Props) {
  const href = sanitizePublicHref(titleHref.trim() || "/", "/");
  const logo = logoUrl ? sanitizePublicImageSrc(logoUrl) : null;

  return (
    <header className="border-b border-wsu-crimson-dark/20 bg-wsu-crimson text-white shadow-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        {logo ? (
          <a href={href} className="shrink-0 leading-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary publisher image URLs */}
            <img
              src={logo}
              alt=""
              className="h-10 w-auto max-w-[200px] object-contain object-left"
            />
          </a>
        ) : null}
        <div className="min-w-0 flex-1">
          <Link
            href={href}
            className="text-lg font-semibold tracking-tight text-white hover:text-white/90"
          >
            {title}
          </Link>
          <p className="text-xs font-medium uppercase tracking-widest text-white/70">{subtitle}</p>
        </div>
        <Link
          href="/admin"
          className="shrink-0 self-start rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/20 sm:self-center"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}

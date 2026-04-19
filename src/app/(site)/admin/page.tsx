import Link from "next/link";
import { getCurrentViewPublication } from "@/lib/cas-store";
import { AdminSignOutButton } from "@/components/AdminSignOutButton";

function formatPublicationDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default async function AdminHomePage() {
  const current = await getCurrentViewPublication();

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-wsu-gray-dark">Admin</h1>
          <p className="mt-2 text-sm leading-relaxed text-wsu-gray">
            Open the publication that drives the public home page, or publish a new CAS export.
          </p>
        </div>
        <AdminSignOutButton />
      </div>

      <div className="space-y-4">
        {current ? (
          <section className="rounded-2xl border border-wsu-gray/10 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-wsu-gray">
              Current public publication
            </h2>
            <p className="mt-2 text-base font-medium text-wsu-gray-dark">{current.title}</p>
            <p className="mt-1 text-sm text-wsu-gray">
              Last updated{" "}
              <time dateTime={current.updated_at}>{formatPublicationDate(current.updated_at)}</time>
            </p>
            <p className="mt-1 font-mono text-xs text-wsu-gray">slug: {current.slug}</p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Link
                href={`/admin/${current.slug}`}
                className="inline-flex items-center justify-center rounded-xl bg-wsu-crimson px-5 py-3 text-sm font-semibold text-white shadow-md shadow-wsu-crimson/20 transition hover:bg-wsu-crimson-dark"
              >
                Continue in admin
              </Link>
              <Link
                href={`/s/${current.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-wsu-gray/20 bg-wsu-cream/50 px-5 py-3 text-sm font-medium text-wsu-gray-dark transition hover:border-wsu-crimson/30 hover:bg-wsu-crimson/[0.04]"
              >
                View public page ↗
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-sm text-amber-950">
            <p className="font-medium">No publication is available yet</p>
            <p className="mt-2 leading-relaxed">
              Upload a CAS workbook to create your first publication. After that, this page will
              show the one tied to the public site (or the most recent upload if none is set).
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-wsu-gray/10 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-wsu-gray">
            New publication
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-wsu-gray">
            Upload Excel export(s). You can attach an optional{" "}
            <span className="font-mono text-wsu-gray-dark">cas-publication-settings-….json</span>{" "}
            file to copy layout and column settings from a previous cycle.
          </p>
          <Link
            href="/admin/new"
            className="mt-4 inline-flex items-center justify-center rounded-xl border-2 border-wsu-crimson/30 bg-white px-5 py-3 text-sm font-semibold text-wsu-crimson transition hover:bg-wsu-crimson/[0.06]"
          >
            Publish new CAS export…
          </Link>
        </section>
      </div>
    </div>
  );
}

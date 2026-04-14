import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-0 flex-1 max-w-2xl flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-wsu-gray/10 bg-white p-10 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-wsu-crimson">
          Washington State University
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-wsu-gray-dark">
          CAS program viewer
        </h1>
        <p className="mt-4 text-base leading-relaxed text-wsu-gray">
          Publish a CAS Excel export to a read-only page with search and program selection.
          Admin sign-in controls uploads and what appears on the public summary.
        </p>
        <nav className="mt-10 flex flex-col gap-3">
          <Link
            href="/admin/login"
            className="inline-flex items-center justify-center rounded-xl bg-wsu-crimson px-5 py-3.5 text-center text-base font-semibold text-white shadow-md transition hover:bg-wsu-crimson-dark"
          >
            Admin sign in
          </Link>
          <Link
            href="/admin"
            className="text-center text-sm font-medium text-wsu-crimson underline decoration-wsu-crimson/30 hover:decoration-wsu-crimson"
          >
            Already signed in? Continue to upload →
          </Link>
          <p className="text-center text-xs text-wsu-gray">
            After publishing, share the public link{" "}
            <code className="rounded bg-wsu-cream px-1.5 py-0.5 font-mono text-wsu-gray-dark">
              /s/&lt;slug&gt;
            </code>
          </p>
        </nav>
      </div>
      <p className="mt-10 text-center text-xs text-wsu-gray">
        <a
          href="https://github.com/gcrouch-wsu/CAS"
          className="underline decoration-wsu-gray/30 hover:text-wsu-crimson"
        >
          Source on GitHub
        </a>
      </p>
    </div>
  );
}

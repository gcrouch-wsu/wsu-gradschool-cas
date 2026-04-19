import { notFound } from "next/navigation";
import { PublicPublicationHeader } from "@/components/PublicPublicationHeader";
import {
  getCurrentViewPublication,
  resolvePublicationPublicHeader,
  toPublicPayload,
} from "@/lib/cas-store";
import PublicCasView from "./s/[slug]/PublicCasView";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function HomePage() {
  const row = await getCurrentViewPublication();
  if (!row) notFound();
  const header = resolvePublicationPublicHeader(row);
  return (
    <>
      <PublicPublicationHeader
        title={header.title}
        subtitle={header.subtitle}
        logoUrl={header.logoUrl}
        titleHref={header.titleHref}
      />
      <div className="flex flex-1 flex-col">
        <PublicCasView initial={toPublicPayload(row)} />
      </div>
    </>
  );
}

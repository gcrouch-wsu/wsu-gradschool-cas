import { notFound } from "next/navigation";
import { PublicPublicationHeader } from "@/components/PublicPublicationHeader";
import { getCurrentViewPublication, resolvePublicationPublicHeader } from "@/lib/cas-store";

export const dynamic = "force-dynamic";

export default async function CurrentViewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  );
}

import { notFound } from "next/navigation";
import { getCurrentViewPublication, toPublicPayload } from "@/lib/cas-store";
import PublicCasView from "../s/[slug]/PublicCasView";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function CurrentViewPage() {
  const row = await getCurrentViewPublication();
  if (!row) notFound();
  return <PublicCasView initial={toPublicPayload(row)} />;
}

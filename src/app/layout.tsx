import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-wsu-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GradCAS and EngineeringCAS Applications | Washington State University",
  description: "Publish GradCAS and EngineeringCAS program summaries for applicants.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sourceSans.variable} h-full antialiased`}>
      <body className={`${sourceSans.className} flex min-h-full flex-col`}>
        {children}
      </body>
    </html>
  );
}

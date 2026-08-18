import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "Questdeck — Game Production, in Play",
    description: "A playful game production workspace for teams who ship.",
    icons: {
      icon: [
        { url: "/favicon.ico?v=2", sizes: "any" },
        { url: "/favicon.png?v=2", type: "image/png", sizes: "512x512" },
      ],
      shortcut: "/favicon.ico?v=2",
      apple: [{ url: "/apple-touch-icon.png?v=2", type: "image/png", sizes: "180x180" }],
    },
    openGraph: { title: "Questdeck — Game Production, in Play", description: "A playful game production workspace for teams who ship.", images: [image] },
    twitter: { card: "summary_large_image", title: "Questdeck — Game Production, in Play", description: "A playful game production workspace for teams who ship.", images: [image] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "مجلس بلوت — البلوت السعودي كما يجب أن يكون";
const description =
  "لعبة بلوت سعودية جماعية بقواعد البطولة الرسمية، غرف خاصة، وطاولة عربية فاخرة.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", metadataBase).toString();
  return {
    title,
    description,
    applicationName: "مجلس بلوت",
    keywords: ["بلوت", "لعبة بلوت", "بلوت اونلاين", "Baloot", "لعبة ورق"],
    metadataBase,
    openGraph: {
      type: "website",
      locale: "ar_SA",
      title,
      description,
      images: [{ url: socialImage, width: 1792, height: 909, alt: "مجلس بلوت — اللعب على أصوله" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#08110e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}

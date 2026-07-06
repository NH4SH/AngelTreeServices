import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Angel Tree Platform",
  description: "Internal platform foundation for Angel Tree Services.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-US">
      <body>{children}</body>
    </html>
  );
}

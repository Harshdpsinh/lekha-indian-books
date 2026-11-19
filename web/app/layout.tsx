import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Lekha | Indian Books", description: "Private Indian bookkeeping, GST and CA reports" };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }

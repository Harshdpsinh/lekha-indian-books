import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Lekha • Drive Books",description:"Private single-user bookkeeping backed by Google Drive"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}

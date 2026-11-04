import {driveSetupReady} from "@/lib/auth";
import LedgerClient from "./ledger-client";
export const dynamic="force-dynamic";
export default function Page(){
 if(driveSetupReady())return <LedgerClient/>;
 return <main className="app" style={{maxWidth:1000}}>
  <header className="head"><div><div className="title">Lekha</div><p className="subtitle">Indian Books • Vercel development preview</p></div><span className="pill">Preview · Setup pending</span></header>
  <section className="card"><h1>Accounting website deployed</h1><p>Welcome to Lekha. This is the public-safe development preview. Google Drive authentication and private financial data storage are not connected yet.</p><div className="notice">No real financial documents can be uploaded and no personal ledger data is shown until private Google OAuth and encryption secrets are configured.</div></section>
  <div className="stats"><div className="card stat"><span className="muted">Bank & card ledger</span><b>Planned</b><p className="muted">Bank, credit card and UPI records</p></div><div className="card stat"><span className="muted">GST reconciliation</span><b>Planned</b><p className="muted">Sales, purchases, ITC and settlements</p></div><div className="card stat"><span className="muted">Month-end CA pack</span><b>Planned</b><p className="muted">Monthly register exports and source ZIP</p></div></div>
  <section className="card"><h2>Next: connect Google login securely</h2><p>In the Vercel project environment settings, configure Google OAuth client credentials, the allowed login email, NextAuth secret and a 32-byte encryption key. A Google Cloud OAuth redirect URI must point to this site’s <code>/api/auth/callback/google</code>.</p><p className="small">Development preview only — not a production-ready business accounting service. No Supabase required.</p></section>
 </main>
}

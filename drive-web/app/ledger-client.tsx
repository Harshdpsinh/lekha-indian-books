"use client";
import {SessionProvider,signIn,signOut,useSession} from "next-auth/react";
import LekhaDashboard from "./components/LekhaDashboard";
function PrivateApp(){
 const {data,status}=useSession();
 if(status==="loading")return <div className="auth"><div className="card">Opening Lekha secure workspace…</div></div>;
 if(!data?.user)return <div className="auth"><section className="card"><div className="title">लेखा · Lekha</div><p className="subtitle">Private Indian Books • Google Drive encrypted ledger</p><p>Sign in with the authorized Google account to access your accounts, GST registers, reconciliation and monthly CA exports.</p><button className="btn" onClick={()=>void signIn("google")}>Sign in with Google</button><p className="notice">Do not use real records until security and reconciliation acceptance tests have been completed.</p></section></div>;
 return <><div className="private-account"><span>Secure account: {data.user.email}</span><button className="btn outline" onClick={()=>void signOut()}>Sign out</button></div><LekhaDashboard demo={false}/></>;
}
export default function LedgerClient(){return <SessionProvider><PrivateApp/></SessionProvider>}

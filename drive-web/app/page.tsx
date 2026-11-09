import {driveSetupReady} from "@/lib/auth";
import LedgerClient from "./ledger-client";
import LekhaDashboard from "./components/LekhaDashboard";
export const dynamic="force-dynamic";
export default function Page(){
 if(driveSetupReady())return <LedgerClient/>;
 return <LekhaDashboard demo={true}/>;
}

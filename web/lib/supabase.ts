import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
export function supabase() { const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; if (!url || !key) return null; if (!client) client=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true}}); return client; }

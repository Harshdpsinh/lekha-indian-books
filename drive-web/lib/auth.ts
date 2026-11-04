import NextAuth, {type NextAuthOptions} from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import type {JWT} from "next-auth/jwt";
import {google} from "googleapis";

declare module "next-auth/jwt" {
 interface JWT {googleRefreshToken?:string;googleAccessToken?:string;googleExpiresAt?:number;accessError?:string;}
}
function required(key:string):string {const value=process.env[key];if(!value)throw new Error("Missing "+key);return value}
export const authOptions:NextAuthOptions={
 providers:[GoogleProvider({
  clientId:required("GOOGLE_CLIENT_ID"),
  clientSecret:required("GOOGLE_CLIENT_SECRET"),
  authorization:{params:{scope:"openid email profile https://www.googleapis.com/auth/drive.appdata",access_type:"offline",prompt:"consent"}}
 })],
 secret:required("NEXTAUTH_SECRET"),
 session:{strategy:"jwt",maxAge:7*24*3600},
 callbacks:{
  async signIn({profile}){const email=profile?.email?.toLowerCase();return !!email&&email===required("LEKHA_ALLOWED_EMAIL").toLowerCase()},
  async jwt({token,account}){
   if(account?.refresh_token)token.googleRefreshToken=account.refresh_token;
   if(account?.access_token){token.googleAccessToken=account.access_token;token.googleExpiresAt=account.expires_at}
   return token;
  },
  async session({session,token}){if(token.accessError)session.expires=new Date(0).toISOString();return session}
 }
};
export const handler=NextAuth(authOptions);
export function googleCredentials(token:JWT){
 if(!token.googleRefreshToken)throw new Error("Drive permission missing: please sign out and sign in again");
 const oauth=new google.auth.OAuth2(required("GOOGLE_CLIENT_ID"),required("GOOGLE_CLIENT_SECRET"));
 oauth.setCredentials({refresh_token:token.googleRefreshToken,access_token:token.googleAccessToken,expiry_date:token.googleExpiresAt?token.googleExpiresAt*1000:undefined});
 return oauth;
}

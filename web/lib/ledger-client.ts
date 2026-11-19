// Single-user compatibility adapter: existing accounting UI retains its query semantics.
// No database token or financial data is stored in browser localStorage.
export type User={id:string;email:string};
type Result={data:any;error:{message:string}|null};
async function request(body:unknown):Promise<Result>{
 try{const r=await fetch("/api/ledger",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store",credentials:"same-origin"});const x=await r.json();if(!r.ok)return {data:null,error:{message:x.error?.message||"Request failed"}};return x}catch{return {data:null,error:{message:"Unable to reach private ledger"}}}
}
class Query implements PromiseLike<Result>{
 private q:Record<string,any>;constructor(table:string){this.q={table,action:"select",filters:[]}}
 select(_columns="*"){this.q.action="select";return this}
 insert(data:unknown){this.q.action="insert";this.q.data=data;return this}
 upsert(data:unknown,options?:unknown){this.q.action="upsert";this.q.data=data;this.q.options=options;return this}
 update(data:unknown){this.q.action="update";this.q.data=data;return this}
 eq(key:string,value:unknown){this.q.filters.push({key,value});return this}
 in(key:string,value:unknown[]){this.q.filters.push({key,value,in:true});return this}
 order(key:string,options?:{ascending?:boolean}){this.q.order={key,ascending:options?.ascending??true};return this}
 range(from:number,to:number){this.q.range={from,to};return this}
 then<A=Result,B=never>(resolve?:((value:Result)=>A|PromiseLike<A>)|null,reject?:((reason:any)=>B|PromiseLike<B>)|null){return request(this.q).then(resolve,reject)}
}
const notify=new Set<(event:string,session:{user:User}|null)=>void>();
const auth={
 async getUser(){const r=await request({action:"session"});return {data:{user:r.data?.user??null},error:r.error}},
 onAuthStateChange(callback:(event:string,session:{user:User}|null)=>void){notify.add(callback);return {data:{subscription:{unsubscribe:()=>notify.delete(callback)}}}},
 async signInWithPassword(credentials:{email:string;password:string}){const r=await request({action:"login",...credentials});if(r.data?.user)notify.forEach(f=>f("SIGNED_IN",{user:r.data.user}));return r},
 async signOut(){const r=await request({action:"logout"});notify.forEach(f=>f("SIGNED_OUT",null));return r}
};
const storage={from(_bucket:string){return {
 async upload(path:string,file:File,_options?:unknown){
  try{
    // Chunk requests to stay below Vercel function body limits. Server assembles bounded files.
    const uploadId=crypto.randomUUID();const total=Math.ceil(file.size/(2*1024*1024));
    for(let i=0;i<total;i++){
     const form=new FormData();form.append("path",path);form.append("uploadId",uploadId);form.append("index",String(i));form.append("total",String(total));form.append("chunk",file.slice(i*2*1024*1024,(i+1)*2*1024*1024));const res=await fetch("/api/ledger/files",{method:"POST",body:form,credentials:"same-origin"});if(!res.ok){const j=await res.json();return {data:null,error:{message:j.error?.message||"Upload failed"}}}
    }return {data:{path},error:null};
  }catch{return {data:null,error:{message:"File upload failed"}}}
 },
 async download(path:string){try{const r=await fetch("/api/ledger/files?path="+encodeURIComponent(path),{cache:"no-store",credentials:"same-origin"});if(!r.ok)return {data:null,error:{message:"File download failed"}};return {data:await r.blob(),error:null}}catch{return {data:null,error:{message:"File download failed"}}}},
 async remove(paths:string[]){return request({action:"removeFiles",paths})}
}}};
const client={auth,storage,from:(table:string)=>new Query(table)};
export type LedgerClient=typeof client;
export function ledger(){return client}

"""Lekha online Supabase -> encrypted Google Drive appData backup.

Runs unattended in GitHub Actions after an authorized owner provisions repository
secrets. Never prints bearer tokens, passphrases, OAuth secrets or document content.
Cloud backup is separate from the existing Windows SQLite watcher.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timezone
from urllib.parse import quote

import requests
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

HEADER=b"LEKHACLOUD1"
TABLES=("accounts","documents","transactions","invoices","commission_settlements")
MAX_FILE=50*1024*1024
MAX_TOTAL=250*1024*1024

def require(name:str)->str:
    value=os.environ.get(name,"")
    if not value:
        raise RuntimeError("Missing required environment secret: "+name)
    return value

def api_request(method:str,path:str,*,params:dict|None=None,timeout=60)->requests.Response:
    url=require("SUPABASE_URL").rstrip("/") + path
    token=require("SUPABASE_SERVICE_ROLE_KEY")
    r=requests.request(method,url,params=params,headers={"Authorization":"Bearer "+token,"apikey":token},timeout=timeout)
    r.raise_for_status()
    return r

def read_table(table:str,user_id:str)->list[dict]:
    data=[];start=0;page=500
    while True:
        params={"select":"*","user_id":"eq."+user_id,"limit":str(page),"offset":str(start)}
        rows=api_request("GET","/rest/v1/"+table,params=params).json()
        if not isinstance(rows,list):
            raise RuntimeError("Unexpected Supabase table response")
        data.extend(rows)
        if len(rows)<page:return data
        start+=page

def snapshot() -> bytes:
    user_id=require("LEKHA_USER_ID")
    if not re.fullmatch(r"[0-9a-fA-F-]{36}",user_id):
        raise ValueError("LEKHA_USER_ID must be a UUID")
    vault:dict[str,list[dict]]={}
    for table in TABLES:vault[table]=read_table(table,user_id)
    stamp=datetime.now(timezone.utc).isoformat()
    buf=io.BytesIO()
    size=0
    manifest={"format":"LEKHA_CLOUD_ZIP_V1","created_at_utc":stamp,"user_id":user_id,"files":[],"tables":{t:len(v) for t,v in vault.items()}}
    with zipfile.ZipFile(buf,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for table,rows in vault.items():
            payload=json.dumps(rows,ensure_ascii=False,default=str,separators=(",",":")).encode()
            size+=len(payload)
            if size>MAX_TOTAL:raise RuntimeError("Backup exceeds 250MB cap; add streaming backup before proceeding")
            archive.writestr("database/"+table+".json",payload)
        for doc in vault["documents"]:
            path=doc["storage_path"]
            if not path.startswith(user_id+"/"):raise RuntimeError("Document path escaped owning user folder")
            r=api_request("GET","/storage/v1/object/authenticated/lekha-documents/"+quote(path,safe="/"),timeout=120)
            if len(r.content)>MAX_FILE:raise RuntimeError("Document exceeds 50MB cap")
            size+=len(r.content)
            if size>MAX_TOTAL:raise RuntimeError("Backup exceeds 250MB cap")
            zip_path="documents/"+doc["id"]+"-"+str(doc["name"]).replace("/","_").replace("\\","_")
            archive.writestr(zip_path,r.content)
            manifest["files"].append({"storage_path":path,"zip_path":zip_path,"sha256":hashlib.sha256(r.content).hexdigest()})
        archive.writestr("manifest.json",json.dumps(manifest,indent=2))
    password=require("LEKHA_BACKUP_PASSPHRASE")
    if len(password)<16:raise RuntimeError("Backup passphrase must be at least 16 characters")
    salt=os.urandom(16)
    kdf=PBKDF2HMAC(algorithm=hashes.SHA256(),length=32,salt=salt,iterations=600_000)
    key=base64.urlsafe_b64encode(kdf.derive(password.encode()))
    encrypted=Fernet(key).encrypt(buf.getvalue())
    return HEADER+salt+encrypted

def upload(encrypted:bytes)->str:
    creds=Credentials(
        token=None,
        refresh_token=require("LEKHA_GDRIVE_REFRESH_TOKEN"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=require("LEKHA_GDRIVE_CLIENT_ID"),
        client_secret=require("LEKHA_GDRIVE_CLIENT_SECRET"),
        scopes=["https://www.googleapis.com/auth/drive.appdata"],
    )
    creds.refresh(Request())
    service=build("drive","v3",credentials=creds,cache_discovery=False)
    name="lekha-cloud-"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")+".lekha"
    media=MediaIoBaseUpload(io.BytesIO(encrypted),mimetype="application/octet-stream",resumable=True)
    file=service.files().create(
        body={"name":name,"parents":["appDataFolder"],"description":"Encrypted Lekha online backup","properties":{"sha256":hashlib.sha256(encrypted).hexdigest(),"format":"LEKHACLOUD1"}},
        media_body=media,fields="id,name,size"
    ).execute()
    if not file.get("id"):raise RuntimeError("Google Drive upload did not return an ID")
    return str(file["id"])

def main():
    blob=snapshot()
    remote_id=upload(blob)
    print("Encrypted cloud backup completed; bytes:",len(blob),"Drive ID:",remote_id)

if __name__=="__main__":
    try: main()
    except Exception as exc:
        # Avoid echoing potentially sensitive HTTP response bodies.
        print("Encrypted cloud backup failed:",type(exc).__name__,file=sys.stderr)
        raise SystemExit(1)

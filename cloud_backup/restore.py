"""Verify and restore LEKHACLOUD1 archives to a NEW local directory.

Usage: python -m cloud_backup.restore encrypted.lekha ./restore-new
Passphrase is requested interactively; no cloud secrets required.
This never writes data back into production Supabase.
"""
from __future__ import annotations
import base64
import getpass
import hashlib
import io
import json
import os
import sys
import zipfile
from pathlib import Path
from cryptography.fernet import Fernet,InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from .backup import HEADER

def restore(src:Path,dest:Path,passphrase:str)->dict:
    if dest.exists():raise FileExistsError("Refusing to overwrite existing restore destination")
    blob=src.read_bytes()
    if not blob.startswith(HEADER) or len(blob)<len(HEADER)+16:raise ValueError("Not a cloud Lekha encrypted backup")
    salt=blob[len(HEADER):len(HEADER)+16]
    kdf=PBKDF2HMAC(algorithm=hashes.SHA256(),length=32,salt=salt,iterations=600_000)
    key=base64.urlsafe_b64encode(kdf.derive(passphrase.encode()))
    payload=Fernet(key).decrypt(blob[len(HEADER)+16:])
    with zipfile.ZipFile(io.BytesIO(payload)) as z:
        manifest=json.loads(z.read("manifest.json"))
        if manifest.get("format")!="LEKHA_CLOUD_ZIP_V1":raise ValueError("Invalid backup manifest")
        for doc in manifest["files"]:
            stored=z.read(doc["zip_path"])
            if hashlib.sha256(stored).hexdigest()!=doc["sha256"]:raise ValueError("Document checksum mismatch")
        if z.testzip():raise ValueError("ZIP failed integrity check")
        for member in z.infolist():
            path=Path(member.filename)
            if member.filename.startswith("/") or "\\" in member.filename or ".." in path.parts:
                raise ValueError("Unsafe archive path")
        dest.mkdir(parents=True,exist_ok=False)
        for member in z.infolist():
            if member.is_dir():continue
            path=dest/member.filename
            path.parent.mkdir(parents=True,exist_ok=True)
            with path.open("xb") as handle:handle.write(z.read(member))
    return manifest

def main():
    if len(sys.argv)!=3:raise SystemExit("Usage: python -m cloud_backup.restore ENCRYPTED.lekha NEW_OUTPUT_FOLDER")
    password=getpass.getpass("Lekha cloud backup passphrase: ")
    try:
        manifest=restore(Path(sys.argv[1]),Path(sys.argv[2]),password)
        print("Verified cloud backup restore. Tables:",manifest["tables"],"Documents:",len(manifest["files"]))
    except (InvalidToken,ValueError,FileExistsError):
        raise SystemExit("Restore failed: wrong password, corrupt archive, or target already exists")

if __name__=="__main__":main()

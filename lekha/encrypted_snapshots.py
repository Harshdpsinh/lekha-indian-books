"""Encrypted snapshots for a user-controlled cloud-sync folder.

Never sync the live SQLite file directly. The cloud folder should be synced by
the user's trusted provider (e.g. OneDrive); this module does not configure or
authenticate any cloud account. Restore is an explicit offline operation and
never overwrites an existing local ledger.
"""
from __future__ import annotations
import base64
import io
import os
import sqlite3
import tempfile
from pathlib import Path
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

HEADER=b"LEKHASNAP1"

def _key(passphrase: str, salt: bytes) -> bytes:
    if len(passphrase) < 12:
        raise ValueError("Use a passphrase at least 12 characters long")
    kdf=PBKDF2HMAC(algorithm=hashes.SHA256(),length=32,salt=salt,iterations=600_000)
    return base64.urlsafe_b64encode(kdf.derive(passphrase.encode("utf8")))

def snapshot(db_path: Path, destination: Path, passphrase: str) -> Path:
    """Atomically export a consistent encrypted database snapshot."""
    db_path=Path(db_path);destination=Path(destination)
    if not db_path.is_file(): raise FileNotFoundError("Local ledger not found")
    destination.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        copy=Path(tmp)/"snapshot.sqlite"
        source=sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro",uri=True)
        try:
            target=sqlite3.connect(copy)
            try:source.backup(target)
            finally:target.close()
        finally:source.close()
        data=copy.read_bytes()
    salt=os.urandom(16)
    blob=HEADER+salt+Fernet(_key(passphrase,salt)).encrypt(data)
    fd,name=tempfile.mkstemp(prefix=".lekha-snapshot-",dir=destination.parent)
    try:
        with os.fdopen(fd,"wb") as handle:
            handle.write(blob);handle.flush();os.fsync(handle.fileno())
        os.replace(name,destination)
    finally:
        if os.path.exists(name):os.unlink(name)
    return destination

def restore_without_overwrite(encrypted_file: Path, destination_db: Path, passphrase: str) -> Path:
    """Explicit restore into a new path. Does not merge or overwrite data."""
    destination_db=Path(destination_db)
    if destination_db.exists():raise FileExistsError("Restore blocked: destination already exists")
    blob=Path(encrypted_file).read_bytes()
    if not blob.startswith(HEADER) or len(blob)<len(HEADER)+16:
        raise ValueError("Not a Lekha encrypted snapshot")
    salt=blob[len(HEADER):len(HEADER)+16]
    plaintext=Fernet(_key(passphrase,salt)).decrypt(blob[len(HEADER)+16:])
    if not plaintext.startswith(b"SQLite format 3\x00"):
        raise ValueError("Decrypted file is not an SQLite database")
    destination_db.parent.mkdir(parents=True,exist_ok=True)
    fd,name=tempfile.mkstemp(prefix=".lekha-restore-",dir=destination_db.parent)
    try:
        with os.fdopen(fd,"wb") as handle:
            handle.write(plaintext);handle.flush();os.fsync(handle.fileno())
        os.link(name,destination_db)
    finally:
        if os.path.exists(name):os.unlink(name)
    return destination_db

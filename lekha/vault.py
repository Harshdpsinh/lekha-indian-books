"""Encrypted local vault. Secrets never written as plaintext JSON."""
from __future__ import annotations
import json, os
from pathlib import Path
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64

VAULT = Path.home() / ".lekha" / "vault.bin"
SALT = Path.home() / ".lekha" / "salt"

def _fernet(passphrase: str, salt: bytes) -> Fernet:
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=120_000)
    key = base64.urlsafe_b64encode(kdf.derive(passphrase.encode()))
    return Fernet(key)

def save(passphrase: str, secrets: dict[str, str]) -> None:
    VAULT.parent.mkdir(parents=True, exist_ok=True)
    salt = os.urandom(16)
    SALT.write_bytes(salt)
    token = _fernet(passphrase, salt).encrypt(json.dumps(secrets).encode())
    VAULT.write_bytes(token)

def load(passphrase: str) -> dict[str, str]:
    salt = SALT.read_bytes()
    raw = _fernet(passphrase, salt).decrypt(VAULT.read_bytes())
    return json.loads(raw)

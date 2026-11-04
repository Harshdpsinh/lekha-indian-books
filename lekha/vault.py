"""Encrypted local vault. Secrets never written as plaintext JSON."""
from __future__ import annotations
import json, os, tempfile
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
    token = _fernet(passphrase, salt).encrypt(json.dumps(secrets).encode())
    # Write both salt and ciphertext into one atomically replaced file.
    # The legacy separate salt file remains readable for migration.
    payload = b"LEKHA2" + salt + token
    fd, temp = tempfile.mkstemp(prefix=".vault-", dir=VAULT.parent)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(payload)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, VAULT)
        try:
            VAULT.chmod(0o600)
        except OSError:
            pass
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def load(passphrase: str) -> dict[str, str]:
    payload = VAULT.read_bytes()
    if payload.startswith(b"LEKHA2"):
        salt, ciphertext = payload[6:22], payload[22:]
    else:
        # Backwards compatibility with the previous vault format.
        salt, ciphertext = SALT.read_bytes(), payload
    raw = _fernet(passphrase, salt).decrypt(ciphertext)
    return json.loads(raw)

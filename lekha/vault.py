"""Encrypted local password vault with atomic, self-contained v2 storage.

Legacy vault.bin + salt files remain readable. No existing vault is deleted or
migrated until the user explicitly saves it with the correct passphrase.
"""
from __future__ import annotations

import base64
import json
import os
import tempfile
from pathlib import Path

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

VAULT = Path.home() / ".lekha" / "vault.bin"
SALT = Path.home() / ".lekha" / "salt"
MAGIC = b"LEKHA2"
ITERATIONS = 600_000


def _fernet(passphrase: str, salt: bytes, iterations: int) -> Fernet:
    if not passphrase:
        raise ValueError("A non-empty master passphrase is required")
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations
    )
    return Fernet(base64.urlsafe_b64encode(kdf.derive(passphrase.encode("utf-8"))))


def save(passphrase: str, secrets: dict[str, str]) -> None:
    """Replace the vault atomically; never overwrite the legacy salt file."""
    if not isinstance(secrets, dict) or any(
        not isinstance(k, str) or not isinstance(v, str)
        for k, v in secrets.items()
    ):
        raise ValueError("Vault entries must be string keys and string values")
    VAULT.parent.mkdir(parents=True, exist_ok=True)
    salt = os.urandom(16)
    token = _fernet(passphrase, salt, ITERATIONS).encrypt(
        json.dumps(secrets).encode("utf-8")
    )
    payload = MAGIC + salt + token
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix=".vault-", dir=VAULT.parent, delete=False
        ) as handle:
            temp_name = handle.name
            try:
                os.chmod(temp_name, 0o600)
            except OSError:
                pass
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, VAULT)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def load(passphrase: str) -> dict[str, str]:
    raw = VAULT.read_bytes()
    if raw.startswith(MAGIC):
        if len(raw) <= len(MAGIC) + 16:
            raise ValueError("Vault data is incomplete")
        salt = raw[len(MAGIC):len(MAGIC) + 16]
        token = raw[len(MAGIC) + 16:]
        decrypted = _fernet(passphrase, salt, ITERATIONS).decrypt(token)
    else:
        # Compatibility with original vault.bin and separate ~/.lekha/salt.
        decrypted = _fernet(passphrase, SALT.read_bytes(), 120_000).decrypt(raw)
    result = json.loads(decrypted)
    if not isinstance(result, dict):
        raise ValueError("Vault content must be a dictionary")
    return result

"""Regression tests for encrypted local vault.

Run: python -m unittest discover -s tests -p 'test_vault.py' -v
"""
import importlib
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cryptography.fernet import InvalidToken


class VaultTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        import lekha.vault as vault
        self.vault = vault
        self.vault_path = Path(self.tmp.name) / "vault.bin"
        self.salt_path = Path(self.tmp.name) / "salt"
        self.patch_vault = patch.object(vault, "VAULT", self.vault_path)
        self.patch_salt = patch.object(vault, "SALT", self.salt_path)
        self.patch_vault.start()
        self.patch_salt.start()
        self.addCleanup(self.patch_vault.stop)
        self.addCleanup(self.patch_salt.stop)

    def test_roundtrip_and_no_plaintext(self):
        data = {"docpw:hdfc": "example-sensitive-password"}
        self.vault.save("strong master password", data)
        self.assertEqual(self.vault.load("strong master password"), data)
        self.assertNotIn(b"example-sensitive-password", self.vault_path.read_bytes())
        self.assertFalse(self.salt_path.exists())

    def test_incorrect_master_password_does_not_overwrite(self):
        data = {"docpw:axis": "another-password"}
        self.vault.save("correct password", data)
        original = self.vault_path.read_bytes()
        with self.assertRaises(InvalidToken):
            self.vault.load("incorrect password")
        self.assertEqual(self.vault_path.read_bytes(), original)

    def test_repeated_saves_remain_readable(self):
        self.vault.save("master", {"first": "one"})
        self.vault.save("master", {"second": "two"})
        self.assertEqual(self.vault.load("master"), {"second": "two"})

    def test_reads_legacy_storage(self):
        salt = os.urandom(16)
        self.salt_path.write_bytes(salt)
        token = self.vault._fernet("master", salt, 120_000).encrypt(b'{"legacy":"yes"}')
        self.vault_path.write_bytes(token)
        self.assertEqual(self.vault.load("master"), {"legacy": "yes"})
        self.assertEqual(self.salt_path.read_bytes(), salt)


if __name__ == "__main__":
    unittest.main()

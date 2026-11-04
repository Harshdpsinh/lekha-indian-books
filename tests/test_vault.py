"""Regression tests for encrypted PDF password vault."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from cryptography.fernet import InvalidToken
import lekha.vault as vault


class VaultTests(unittest.TestCase):
    def test_round_trip_and_wrong_password(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            with patch.object(vault, "VAULT", target / "vault.bin"), patch.object(vault, "SALT", target / "salt"):
                vault.save("a-long-test-master-password", {"docpw:bank": "sample-secret"})
                self.assertEqual(vault.load("a-long-test-master-password")["docpw:bank"], "sample-secret")
                self.assertTrue((target / "vault.bin").read_bytes().startswith(b"LEKHA2"))
                self.assertFalse((target / "salt").exists())
                self.assertNotIn(b"sample-secret", (target / "vault.bin").read_bytes())
                with self.assertRaises(InvalidToken):
                    vault.load("wrong-master-password")


if __name__ == "__main__":
    unittest.main()

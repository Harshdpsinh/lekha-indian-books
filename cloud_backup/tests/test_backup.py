"""Offline backup tests: synthetic owner data only; no live credentials."""
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from cryptography.fernet import InvalidToken

from cloud_backup import backup
from cloud_backup.restore import restore

USER="01234567-89ab-4cde-8000-0123456789ab"
DOC={"id":"00112233-4455-6677-8899-aabbccddeeff","user_id":USER,"name":"synthetic-statement.pdf","storage_path":USER+"/2026-10/synthetic.pdf","kind":"bank","month":"2026-10"}
PASSWORD="test-only-long-backup-key-12345"

def sample_table(name,user_id):
    if name=="documents":
        return [DOC.copy()]
    if name=="transactions":
        return [{"id":"t-1","user_id":user_id,"amount_paise":12345,"description":"Synthetic test"}]
    return []

class BackupTests(unittest.TestCase):
    def _snapshot(self):
        with patch.dict(os.environ,{"LEKHA_USER_ID":USER,"LEKHA_BACKUP_PASSPHRASE":PASSWORD}):
            with patch.object(backup,"read_table",side_effect=sample_table):
                with patch.object(backup,"api_request",return_value=SimpleNamespace(content=b"%PDF-1.4\nsynthetic")):
                    return backup.snapshot()

    def test_round_trip_includes_tables_and_source_documents(self):
        encrypted=self._snapshot()
        self.assertTrue(encrypted.startswith(backup.HEADER))
        self.assertNotIn(b"Synthetic test",encrypted)
        with tempfile.TemporaryDirectory() as root:
            source=Path(root)/"backup.lekha"
            source.write_bytes(encrypted)
            destination=Path(root)/"restored-new"
            manifest=restore(source,destination,PASSWORD)
            self.assertEqual(manifest["tables"]["transactions"],1)
            self.assertEqual(manifest["tables"]["documents"],1)
            self.assertEqual((destination/"database"/"transactions.json").read_text().count("Synthetic test"),1)
            self.assertEqual(len(manifest["files"]),1)
            self.assertEqual((destination/manifest["files"][0]["zip_path"]).read_bytes(),b"%PDF-1.4\nsynthetic")

    def test_wrong_password_does_not_create_restore_folder(self):
        encrypted=self._snapshot()
        with tempfile.TemporaryDirectory() as root:
            source=Path(root)/"backup.lekha"
            source.write_bytes(encrypted)
            out=Path(root)/"recovered"
            with self.assertRaises(InvalidToken):
                restore(source,out,"wrong-password-example")
            self.assertFalse(out.exists())

    def test_never_overwrite_existing_restore_directory(self):
        encrypted=self._snapshot()
        with tempfile.TemporaryDirectory() as root:
            src=Path(root)/"backup.lekha"
            src.write_bytes(encrypted)
            dest=Path(root)/"existing"
            dest.mkdir()
            with self.assertRaises(FileExistsError):
                restore(src,dest,PASSWORD)

if __name__=="__main__":
    unittest.main()

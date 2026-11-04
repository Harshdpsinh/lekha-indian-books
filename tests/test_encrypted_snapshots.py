import sqlite3
import tempfile
import unittest
from pathlib import Path
from cryptography.fernet import InvalidToken
from lekha.encrypted_snapshots import snapshot, restore_without_overwrite

class SnapshotTests(unittest.TestCase):
    def test_roundtrip_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            db=root/"original.sqlite"
            with sqlite3.connect(db) as con:
                con.execute("CREATE TABLE example (value TEXT)")
                con.execute("INSERT INTO example VALUES ('secret-value')")
            snap=root/"cloud"/"encrypted.lekha"
            snapshot(db,snap,"a-strong-test-passphrase")
            self.assertNotIn(b"secret-value",snap.read_bytes())
            restored=root/"restored.sqlite"
            restore_without_overwrite(snap,restored,"a-strong-test-passphrase")
            with sqlite3.connect(restored) as con:
                self.assertEqual(con.execute("SELECT value FROM example").fetchone()[0],"secret-value")
            with self.assertRaises(FileExistsError):
                restore_without_overwrite(snap,restored,"a-strong-test-passphrase")
            with self.assertRaises(InvalidToken):
                restore_without_overwrite(snap,root/"other.sqlite","invalid-passphrase-123")

if __name__=="__main__":unittest.main()

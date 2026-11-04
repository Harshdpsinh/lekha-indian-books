import io
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from lekha.encrypted_snapshots import snapshot, restore_without_overwrite
from lekha.google_drive import list_snapshots, download_snapshot, upload_snapshot, checksum


class Call:
    def __init__(self, data):
        self.data = data
    def execute(self):
        return self.data


class FakeFiles:
    def __init__(self, pages):
        self.pages = pages
        self.calls = []
    def list(self, **kwargs):
        self.calls.append(kwargs)
        return Call(self.pages[kwargs.get("pageToken")])
    def create(self, **kwargs):
        self.upload = kwargs
        return Call({"id": "new_file_id", "name": kwargs["body"]["name"]})


class Service:
    def __init__(self, pages):
        self.api = FakeFiles(pages)
    def files(self):
        return self.api


class DriveTests(unittest.TestCase):
    def test_paginate_and_filter_only_appdata_snapshots(self):
        svc = Service({
            None: {"nextPageToken": "second", "files": [
                {"id": "one", "name": "lekha-snapshot-a.lekha", "createdTime": "2026-01-01"},
                {"id": "bad", "name": "unrelated.pdf", "createdTime": "2026-04-01"}]},
            "second": {"files": [{"id": "two", "name": "lekha-snapshot-b.lekha", "createdTime": "2026-03-01"}]}
        })
        self.assertEqual([r["id"] for r in list_snapshots(svc)], ["two", "one"])
        self.assertEqual(svc.api.calls[0]["spaces"], "appDataFolder")

    def test_upload_encrypted_only_and_deduplicate(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            blob = root / "snapshot.lekha"
            blob.write_bytes(b"LEKHASNAP1" + b"encrypted-placeholder")
            digest = checksum(blob.read_bytes())
            same = Service({None: {"files": [
                {"id": "old", "name": "lekha-snapshot-old.lekha",
                 "properties": {"sha256": digest}}]}})
            result = upload_snapshot(same, blob)
            self.assertFalse(result["uploaded"])
            self.assertFalse(hasattr(same.api, "upload"))
            fresh = Service({None: {"files": []}})
            with patch("googleapiclient.http.MediaFileUpload", return_value=object()):
                result = upload_snapshot(fresh, blob)
            self.assertTrue(result["uploaded"])
            self.assertEqual(fresh.api.upload["body"]["parents"], ["appDataFolder"])
            notencrypted = root / "raw.sqlite"
            notencrypted.write_bytes(b"SQLite format 3\x00")
            with self.assertRaises(ValueError):
                upload_snapshot(fresh, notencrypted)

    def test_snapshot_restore_and_corruption(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            db = root / "test.sqlite"
            with sqlite3.connect(db) as connection:
                connection.execute("CREATE TABLE sample (value TEXT)")
                connection.execute("INSERT INTO sample VALUES ('only-local')")
            path = root / "backup.lekha"
            snapshot(db, path, "long-enough-example-password")
            self.assertNotIn(b"only-local", path.read_bytes())
            restored = root / "restored.sqlite"
            restore_without_overwrite(path, restored, "long-enough-example-password")
            with sqlite3.connect(restored) as connection:
                self.assertEqual(connection.execute("SELECT value FROM sample").fetchone()[0], "only-local")
            with self.assertRaises(FileExistsError):
                restore_without_overwrite(path, restored, "long-enough-example-password")


if __name__ == "__main__":
    unittest.main()

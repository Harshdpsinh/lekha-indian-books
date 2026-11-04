"""Local Google Drive encrypted backup command.

Examples:
  python -m lekha.drive_sync authorize --client-json C:/secure/client.json
  python -m lekha.drive_sync push
  python -m lekha.drive_sync watch --interval 900
  python -m lekha.drive_sync list
  python -m lekha.drive_sync download --id DRIVE_FILE_ID --output C:/restore/copy.lekha
  python -m lekha.drive_sync restore --encrypted C:/restore/copy.lekha --dest C:/restore/books-restored.sqlite

Requires a local interactive session to unlock the encryption key.
No plaintext data or master password is uploaded.
"""
from __future__ import annotations
import argparse
import getpass
import tempfile
import time
from pathlib import Path
from .encrypted_snapshots import snapshot, restore_without_overwrite
from .google_drive import authorize, drive_service, list_snapshots, upload_snapshot, download_snapshot

DB = Path.home() / ".lekha" / "books.sqlite"

def _ask_master():
    password = getpass.getpass("Lekha backup master password (not your Google password): ")
    if len(password) < 12:
        raise ValueError("Master password must be at least 12 characters")
    return password

def push(service, db_path: Path, password: str, device: str = "local"):
    with tempfile.TemporaryDirectory() as folder:
        encrypted = Path(folder) / "backup.lekha"
        snapshot(db_path, encrypted, password)
        return upload_snapshot(service, encrypted, device_label=device)

def _signature(db: Path):
    # Includes SQLite write-ahead log if present.
    result = []
    for path in (db, Path(str(db) + "-wal")):
        if path.exists():
            stat = path.stat()
            result.append((str(path), stat.st_mtime_ns, stat.st_size))
    return tuple(result)

def watch(service, db: Path, master_password: str, interval: int, device: str):
    """Automatic backups while this local unlocked process is running."""
    if interval < 60:
        raise ValueError("Minimum auto-backup interval is 60 seconds")
    last = None
    while True:
        state = _signature(db)
        if state and state != last:
            result = push(service, db, master_password, device)
            print("Encrypted backup checked:", "uploaded" if result["uploaded"] else "already on Drive")
            last = state
        time.sleep(interval)

def main(argv=None):
    parser=argparse.ArgumentParser(description="Lekha encrypted Google Drive backups")
    sub=parser.add_subparsers(dest="command",required=True)
    auth=sub.add_parser("authorize",help="Connect Google Drive in local browser")
    auth.add_argument("--client-json",required=True,type=Path)
    sync=sub.add_parser("push",help="Push one encrypted cloud backup")
    sync.add_argument("--db",type=Path,default=DB)
    sync.add_argument("--device",default="local")
    auto=sub.add_parser("watch",help="Automatically back up while unlocked process runs")
    auto.add_argument("--db",type=Path,default=DB)
    auto.add_argument("--interval",type=int,default=900)
    auto.add_argument("--device",default="local")
    sub.add_parser("list",help="List private encrypted backups")
    down=sub.add_parser("download",help="Download one encrypted backup without overwriting")
    down.add_argument("--id",required=True)
    down.add_argument("--output",type=Path,required=True)
    restore=sub.add_parser("restore",help="Decrypt a downloaded backup into a NEW local SQLite path")
    restore.add_argument("--encrypted",required=True,type=Path)
    restore.add_argument("--dest",required=True,type=Path)
    args=parser.parse_args(argv)
    if args.command=="authorize":
        authorize(args.client_json)
        print("Google Drive authorized. OAuth credentials stored in local OS credential manager.")
        return
    if args.command=="restore":
        restored=restore_without_overwrite(args.encrypted,args.dest,_ask_master())
        print("Decrypted database restored into separate path:",restored)
        return
    service=drive_service()
    if args.command=="push":
        result=push(service,args.db,_ask_master(),args.device)
        print("Encrypted backup:", "uploaded" if result["uploaded"] else "already backed up")
    elif args.command=="watch":
        print("Automatic encrypted backup watcher active; stop with Ctrl+C")
        try:watch(service,args.db,_ask_master(),args.interval,args.device)
        except KeyboardInterrupt:print("Watcher stopped")
    elif args.command=="list":
        for item in list_snapshots(service):
            print(item["id"],item["name"],item.get("createdTime",""))
    elif args.command=="download":
        path=download_snapshot(service,args.id,args.output)
        print("Downloaded encrypted snapshot to:",path)

if __name__=="__main__":
    main()

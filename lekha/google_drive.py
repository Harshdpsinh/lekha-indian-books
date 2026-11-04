"""Google Drive private-app-data transport for encrypted Lekha snapshots.

Only encrypted .lekha blobs are uploaded, never SQLite, statements or passwords.
OAuth uses drive.appdata scope and stores refresh tokens in the OS credential
manager via keyring. The user must explicitly authenticate from their machine.

This is append-only cloud backup, NOT multi-device concurrent database merging.
"""
from __future__ import annotations

import hashlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/drive.appdata"]
TOKEN_SERVICE = "Lekha-GoogleDrive-OAuth"
TOKEN_USER = "single-user"
FOLDER = "appDataFolder"
PREFIX = "lekha-snapshot-"


def authorize(client_json: str | Path):
    """Interactive authorization for a desktop OAuth client."""
    import keyring
    from google_auth_oauthlib.flow import InstalledAppFlow

    source = Path(client_json)
    if not source.is_file():
        raise FileNotFoundError("Google desktop OAuth client JSON missing")
    flow = InstalledAppFlow.from_client_secrets_file(str(source), SCOPES)
    credentials = flow.run_local_server(port=0, open_browser=True)
    keyring.set_password(TOKEN_SERVICE, TOKEN_USER, credentials.to_json())
    return True


def credentials_from_keyring():
    """Fail closed if the keyring has no token; never write tokens to disk."""
    import keyring
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    raw = keyring.get_password(TOKEN_SERVICE, TOKEN_USER)
    if not raw:
        raise RuntimeError("Connect Google Drive first using the authorize command")
    credentials = Credentials.from_authorized_user_info(json.loads(raw), SCOPES)
    if not credentials.valid:
        if not credentials.refresh_token:
            raise RuntimeError("Google authorization expired; reconnect from desktop")
        credentials.refresh(Request())
        keyring.set_password(TOKEN_SERVICE, TOKEN_USER, credentials.to_json())
    return credentials


def drive_service():
    from googleapiclient.discovery import build
    return build("drive", "v3", credentials=credentials_from_keyring(), cache_discovery=False)


def checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def list_snapshots(service, page_size: int = 100):
    """List private snapshots across all pages, newest first."""
    found = []
    token = None
    while True:
        response = service.files().list(
            spaces="appDataFolder",
            q="trashed = false",
            fields="nextPageToken, files(id,name,size,createdTime,description,properties)",
            pageSize=min(max(page_size, 1), 1000),
            pageToken=token,
        ).execute()
        found.extend(
            item for item in response.get("files", [])
            if item.get("name", "").startswith(PREFIX)
            and item.get("name", "").endswith(".lekha")
        )
        token = response.get("nextPageToken")
        if not token:
            break
    return sorted(found, key=lambda x: x.get("createdTime", ""), reverse=True)


def upload_snapshot(service, encrypted_file: Path, *, device_label: str = "local"):
    """Upload immutable encrypted snapshot; dedupe exact bytes on this device."""
    from googleapiclient.http import MediaFileUpload

    encrypted_file = Path(encrypted_file)
    data = encrypted_file.read_bytes()
    if not data.startswith(b"LEKHASNAP1"):
        raise ValueError("Only encrypted Lekha snapshot files may be uploaded")
    digest = checksum(data)
    # Restrict labels to non-sensitive local identifiers.
    safe_device = "".join(c for c in device_label if c.isalnum() or c in "-_")[:30] or "local"
    for item in list_snapshots(service):
        props = item.get("properties") or {}
        if props.get("sha256") == digest:
            return {"id": item["id"], "uploaded": False, "reason": "already-backed-up"}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    name = f"{PREFIX}{stamp}-{safe_device}-{digest[:12]}.lekha"
    media = MediaFileUpload(str(encrypted_file), mimetype="application/octet-stream", resumable=True)
    created = service.files().create(
        body={
            "name": name,
            "parents": [FOLDER],
            "description": "Encrypted Lekha database backup. Contains no plaintext accounting data.",
            "properties": {"sha256": digest, "format": "LEKHASNAP1", "device": safe_device},
        },
        media_body=media,
        fields="id,name,size,createdTime,properties",
    ).execute()
    return {"id": created["id"], "uploaded": True, "name": created.get("name", name)}


def download_snapshot(service, file_id: str, output: Path) -> Path:
    """Download selected encrypted blob to a new local path, never overwrite."""
    from googleapiclient.http import MediaIoBaseDownload

    eligible = {item["id"]: item for item in list_snapshots(service)}
    if file_id not in eligible:
        raise ValueError("Snapshot ID not found in private Lekha backups")
    output = Path(output)
    if output.exists():
        raise FileExistsError("Will not replace existing download")
    output.parent.mkdir(parents=True, exist_ok=True)
    request = service.files().get_media(fileId=file_id)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    payload = buffer.getvalue()
    if not payload.startswith(b"LEKHASNAP1"):
        raise ValueError("Downloaded file failed Lekha encrypted-file format check")
    expected = (eligible[file_id].get("properties") or {}).get("sha256")
    if expected and checksum(payload) != expected:
        raise ValueError("Downloaded ciphertext checksum does not match")
    # x mode prevents accidental overwrite.
    with output.open("xb") as f:
        f.write(payload)
    return output


def disconnect():
    """Remove the locally stored OAuth grant; revoke remote access in Google settings."""
    import keyring
    try:
        keyring.delete_password(TOKEN_SERVICE, TOKEN_USER)
    except keyring.errors.PasswordDeleteError:
        pass

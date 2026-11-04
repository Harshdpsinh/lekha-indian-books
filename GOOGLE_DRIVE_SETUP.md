# Lekha — Google Drive encrypted backup setup (development)

## Security and scope

- **Google Drive's private application-data folder** is used through the narrow `drive.appdata` OAuth scope. This integration cannot browse the user's normal Drive files.
- Only an **encrypted, consistent SQLite snapshot** is uploaded. Neither plaintext financial statements nor database files are sent to Drive.
- Google OAuth refresh credentials are saved through the **operating-system credential manager** (`keyring`). The master password is entered locally, kept in process memory while the watcher runs, and not saved.
- Uploads are immutable. Exact repeated encrypted blobs are skipped. Downloads and decrypted restores **never overwrite** a local file.
- This is **automatic encrypted cloud backup while a local watcher is running**, not real-time two-way multi-device synchronization. Do **not** run two independent writable installations expecting merge; conflicts will NOT be merged. The backup watcher does not start automatically on Windows boot.
- Google authorization must be completed from your Windows machine. It cannot be done safely by committing OAuth credentials to the repository.

## Set up on Windows

1. In Google Cloud Console create or select a project, enable **Google Drive API**, configure an OAuth consent screen and a **Desktop application OAuth client**. If the app is in Testing mode, add your own Google account as a test user.
2. Download the Desktop OAuth client JSON **outside the GitHub checkout** (for example your Windows user profile under a private folder). Never commit or share it. The JSON file is not your bank master password.
3. In a terminal at the Lekha repository root run `pip install -r requirements.txt`.
4. Authorize once:
   ```powershell
   python -m lekha.drive_sync authorize --client-json "C:\\Users\\YOU\\Private\\google-oauth-client.json"
   ```
   The browser opens a Google consent flow and saves the refresh credential in your OS credential manager.
5. To upload one encrypted snapshot:
   ```powershell
   python -m lekha.drive_sync push --device Windows-PC
   ```
   Enter your Lekha **backup master password** (at least 12 characters), not your Google password.
6. To back up automatically while the program is running:
   ```powershell
   python -m lekha.drive_sync watch --interval 900 --device Windows-PC
   ```
   It checks for local database-file changes approximately every 15 minutes. The watcher stops when this terminal/process closes. It does not upload plaintext or save the entered master password.
7. To inspect backups:
   ```powershell
   python -m lekha.drive_sync list
   ```
8. To restore safely, first close any running Lekha application. Download a chosen Drive file ID, then decrypt into a new database location:
   ```powershell
   python -m lekha.drive_sync download --id GOOGLE_FILE_ID --output "C:\\Private\\lekha-backup.lekha"
   python -m lekha.drive_sync restore --encrypted "C:\\Private\\lekha-backup.lekha" --dest "C:\\Private\\lekha-restored.sqlite"
   ```
   Compare and inspect the restored copy before deciding to switch local databases. **The restore command does not replace existing accounting records.**

## Online app caveat

Online deployment still needs app authentication, managed secrets, encryption-key management, secure network transport and a deployment target. Do **not** expose the current Streamlit interface directly to the internet. A local OAuth desktop session cannot be transparently reused as a public hosted web-app login.

## Test

```powershell
python -m unittest discover -s tests -v
```

Unit tests use mocks; live Google Drive login, upload, recovery and multi-device conflict drills still require interactive end-to-end acceptance testing.

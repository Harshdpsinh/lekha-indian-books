# Encrypted cloud backup (proposed activation)

This is a **different backup system** from the Windows watcher. It exports all user-owned rows from Supabase public accounting tables plus all indexed private source documents, encrypts them into one LEKHACLOUD1 snapshot, and uploads ciphertext to Google Drive appDataFolder. It never uploads plaintext. A local offline restore verifier exists in restore.py.

## Activation requirements
1. Complete and review database setup (`web/supabase/schema.sql` and `002_commission_settlements.sql`).
2. Configure a Google OAuth client with Drive appData scope and a renewable refresh token via an appropriate secure OAuth flow. **Never paste client secrets, refresh tokens, user passphrase or service-role keys in chat or commit them.** The previously authorized desktop OAuth grant does not automatically activate this cloud workflow.
3. Set GitHub repository **Actions secrets**: LEKHA_SUPABASE_URL, LEKHA_SUPABASE_SERVICE_ROLE_KEY, LEKHA_USER_ID, LEKHA_BACKUP_PASSPHRASE (16+ chars), LEKHA_GDRIVE_CLIENT_ID, LEKHA_GDRIVE_CLIENT_SECRET, LEKHA_GDRIVE_REFRESH_TOKEN.
4. For scheduled runs, this workflow must exist on the repository **default branch**. On feature branches it can only be tested by an appropriate manual trigger after merging or via supported workflow refs.
5. Run a manual backup using GitHub Actions and verify the remote encrypted file and offline restore. No claim of backup protection until confirmed.
6. Backups are immutable; storage retention/pruning and failure alerts remain to be implemented. Monitor Google Drive quota.

## Constraints
- 50MB maximum per source document; 250MB uncompressed aggregate cap. Fails closed on unavailable documents; does not silently report incomplete backup as success.
- Saves database as JSON plus original document files; restore is a verified **offline extraction** into a NEW directory, not automatic import into production PostgreSQL.
- Intended for one authorized user. Keep service-role credentials in Actions secrets and audit repository access.
- Google OAuth refresh tokens may expire or be revoked; unattended backup failures must be monitored.
- Scheduled GitHub Actions are not guaranteed to run at an exact minute. Free-tier minutes/quotas apply.
- The archive decryption passphrase must be retained securely by the owner; it cannot be recovered.

## Local verification
After downloading a trusted `.lekha` snapshot, install dependencies `pip install cryptography requests google-api-python-client google-auth`, then:
```
python -m cloud_backup.restore encrypted-file.lekha new-restore-folder
```
The restore tool refuses to overwrite existing directories and checks SHA-256 integrity.

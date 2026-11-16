# 🔒 Safe Place

Encrypted file storage hosted on GitHub Pages. Files are encrypted client-side with AES-256-GCM before upload -- your passkey never leaves the browser.

## Features

- **Passkey protection** -- lock screen prevents unauthorized access
- **Client-side encryption** -- files encrypted with AES-256-GCM (Web Crypto API) before upload
- **GitHub as storage** -- files stored in your repo's `uploads/` folder
- **Upload & download** -- drag-and-drop or click to upload; one-click download with auto-decrypt
- **Delete files** -- remove files directly from the browser
- **No server needed** -- runs entirely on GitHub Pages

## Setup

1. Create a GitHub repo (e.g. `safe-place`)
2. Push this code to the repo
3. Go to **Settings > Pages** and set source to `main` branch, root folder
4. Create a [Personal Access Token](https://github.com/settings/tokens/new?scopes=repo&description=safe-place) with `repo` scope
5. Visit your GitHub Pages URL and enter your passkey + token

## How it works

1. You set a **passkey** on first use (stored as an encrypted marker in localStorage)
2. Connect to GitHub with a **Personal Access Token**
3. Files you upload are **encrypted with your passkey** then pushed to the repo
4. Files you download are **decrypted in the browser** with the same passkey
5. Without the passkey, the files in the repo are unreadable ciphertext

## Security notes

- Encryption uses PBKDF2 key derivation (100k iterations) + AES-256-GCM
- The passkey marker is stored in localStorage to verify correct passkey on return visits
- GitHub token is stored in localStorage (per-origin isolation)
- For maximum security, use a strong passkey and rotate your GitHub token periodically

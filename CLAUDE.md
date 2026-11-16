# Safe Place -- Project Instructions

## Overview

Safe Place is a static web app (HTML/CSS/JS) hosted on GitHub Pages that provides a file manager UI backed by Google Drive. It uses the Google Drive API v3 with OAuth 2.0 (Google Identity Services) for authentication. No build tools, no frameworks -- just vanilla JS.

## Architecture

```
index.html   -- login screen + file manager UI
style.css    -- light theme with teal accents (CloudMe-inspired)
app.js       -- Google auth, Drive API, SafePlaceStorage class, UI logic
```

### Key concepts

- **SafePlaceStorage class** (`app.js`) -- reusable Google Drive wrapper. Exposed as `window.SafePlaceStorage` (constructor) and `window.safePlace` (instance after login). Other apps (password-manager, music-player) import this to read/write their own subfolder under `SafePlace/`.
- **Root folder**: all files live under a Google Drive folder named `SafePlace`. Created automatically on first sign-in.
- **App folders**: each app gets its own subfolder via `safePlace.getAppFolder('app-name')`.
- **Scope**: `drive.file` -- the app can only access files it created. It cannot see the user's other Drive files.

### Google Cloud setup

- **Project**: Youtube Project 9869 (existing GCP project)
- **Client ID**: `805871064081-6uh6ghboi12sd4p5vn26cmalfh48lgaj.apps.googleusercontent.com`
- **Authorized JS origins**: `http://localhost:3001`, `http://127.0.0.1:3001`, `https://dat5ngon.github.io`
- **OAuth consent screen**: Testing mode. Test user: `dat5ngon@gmail.com`

## Development

### Local server

```bash
cd C:\01.Projects\safe-place
python -m http.server 3001 --bind 127.0.0.1
```

Open `http://localhost:3001`.

### Deployment

Hosted on GitHub Pages from the `master` branch root.

```bash
git add -A && git commit -m "description" && git push
```

GitHub Pages URL: `https://dat5ngon.github.io/safe-place/`

### Repository

- **Personal GitHub**: `dat5ngon/safe-place`
- **Branch**: `master`

## Coding guidelines

1. **No build tools** -- keep it vanilla HTML/CSS/JS. No npm, no bundlers.
2. **No frameworks** -- no React, Vue, etc. DOM manipulation only.
3. **Google API via fetch** -- don't use the gapi client library (too heavy). Use `fetch()` with `Authorization: Bearer` header directly.
4. **Client ID is public** -- it's an OAuth Client ID, not a secret. Safe to commit.
5. **Theme**: light background (`#f5f7fa`), teal primary (`#2cb5b5`), white cards with subtle shadows. Match the CloudMe aesthetic.
6. **File operations** go through `SafePlaceStorage` class methods -- don't call the Drive API directly from UI handlers.
7. **Error handling**: show errors in the UI (status divs, alerts). Don't swallow errors silently.

## Storage API reference

After sign-in, `window.safePlace` is a `SafePlaceStorage` instance:

| Method | Description |
|--------|-------------|
| `getAppFolder(name)` | Get/create a subfolder under SafePlace root |
| `getOrCreateFolder(name, parentId)` | Get/create a folder inside any parent |
| `listFiles(folderId)` | List files and folders |
| `uploadFile(file, folderId)` | Upload a File object |
| `uploadData(name, data, mimeType, folderId)` | Upload raw data (string, ArrayBuffer) |
| `downloadFile(fileId)` | Download as Blob |
| `downloadText(fileId)` | Download as text |
| `downloadJSON(fileId)` | Download and parse as JSON |
| `findFile(name, folderId)` | Find a file by name |
| `deleteFile(fileId)` | Delete a file or folder |

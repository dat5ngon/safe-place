# 📁 Safe Place

Personal file storage on Google Drive, hosted on GitHub Pages. Upload, browse, and download files through a clean web interface -- all stored in a `SafePlace` folder on your Google Drive.

## Features

- **Google Sign-In** -- no tokens or passwords to manage
- **Folder navigation** -- create subfolders, browse with breadcrumbs
- **Drag & drop upload** -- upload multiple files at once
- **Download & delete** -- one-click file management
- **App-specific folders** -- other apps (password-manager, music-player) can use their own subfolder
- **No server needed** -- runs entirely on GitHub Pages

## Storage API for other apps

Other apps can import SafePlace as a storage backend. After the user signs in, the global `window.safePlace` object exposes:

```js
// Get or create an app-specific folder
const folder = await safePlace.getAppFolder('music-player');

// Upload a file
await safePlace.uploadFile(fileObject, folder.id);

// Upload raw data (JSON, text, etc.)
await safePlace.uploadData('playlist.json', jsonString, 'application/json', folder.id);

// List files in a folder
const files = await safePlace.listFiles(folder.id);

// Download as blob / text / JSON
const blob = await safePlace.downloadFile(fileId);
const text = await safePlace.downloadText(fileId);
const data = await safePlace.downloadJSON(fileId);

// Find a file by name
const file = await safePlace.findFile('config.json', folder.id);

// Delete a file
await safePlace.deleteFile(fileId);
```

## Folder structure on Google Drive

```
My Drive/
  SafePlace/
    password-manager/
      passwords.json
    music-player/
      playlist.json
    my-document.pdf
    photo.jpg
```

// Safe Place - File Storage on Google Drive
// Supports folder navigation and a reusable API for other apps

const CLIENT_ID = '805871064081-6uh6ghboi12sd4p5vn26cmalfh48lgaj.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const ROOT_FOLDER_NAME = 'SafePlace';

// ── State ──
let state = {
    accessToken: null,
    rootFolderId: null,
    currentFolderId: null,
    folderPath: [],       // [{id, name}, ...] breadcrumb trail
    tokenClient: null,
    userEmail: null,
};

const $ = (id) => document.getElementById(id);

// ══════════════════════════════════════════════════════════
// SafePlace Storage API -- reusable by other apps
// ══════════════════════════════════════════════════════════

class SafePlaceStorage {
    constructor(accessToken, rootFolderId) {
        this.accessToken = accessToken;
        this.rootFolderId = rootFolderId;
    }

    async _api(path, options = {}) {
        const url = path.startsWith('http') ? path : `https://www.googleapis.com/drive/v3${path}`;
        const res = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                ...options.headers,
            },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Drive API error: ${res.status}`);
        }
        return res;
    }

    // Find a subfolder by name inside a parent, or create it
    async getOrCreateFolder(name, parentId) {
        parentId = parentId || this.rootFolderId;
        const query = `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const res = await this._api(`/files?q=${encodeURIComponent(query)}&fields=files(id,name)`);
        const data = await res.json();

        if (data.files && data.files.length > 0) {
            return data.files[0];
        }

        const createRes = await this._api('/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId],
            }),
        });
        return createRes.json();
    }

    // List files and folders in a folder
    async listFiles(folderId) {
        folderId = folderId || this.rootFolderId;
        const query = `'${folderId}' in parents and trashed=false`;
        const res = await this._api(`/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,modifiedTime,mimeType)&orderBy=folder,name&pageSize=100`);
        const data = await res.json();
        return data.files || [];
    }

    // Upload a file to a folder
    async uploadFile(file, folderId) {
        folderId = folderId || this.rootFolderId;
        const metadata = {
            name: file.name,
            parents: [folderId],
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime,mimeType', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.accessToken}` },
            body: form,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Upload failed: ${res.status}`);
        }
        return res.json();
    }

    // Upload raw data (for other apps exporting JSON, etc.)
    async uploadData(name, data, mimeType, folderId) {
        folderId = folderId || this.rootFolderId;
        const metadata = {
            name,
            parents: [folderId],
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([data], { type: mimeType }));

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,modifiedTime,mimeType', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.accessToken}` },
            body: form,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Upload failed: ${res.status}`);
        }
        return res.json();
    }

    // Download a file as blob
    async downloadFile(fileId) {
        const res = await this._api(`/files/${fileId}?alt=media`);
        return res.blob();
    }

    // Download a file as text
    async downloadText(fileId) {
        const res = await this._api(`/files/${fileId}?alt=media`);
        return res.text();
    }

    // Download a file as JSON
    async downloadJSON(fileId) {
        const res = await this._api(`/files/${fileId}?alt=media`);
        return res.json();
    }

    // Delete a file or folder
    async deleteFile(fileId) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${this.accessToken}` },
        });
    }

    // Find a file by name in a folder
    async findFile(name, folderId) {
        folderId = folderId || this.rootFolderId;
        const query = `name='${name}' and '${folderId}' in parents and trashed=false`;
        const res = await this._api(`/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,modifiedTime,mimeType)`);
        const data = await res.json();
        return data.files && data.files.length > 0 ? data.files[0] : null;
    }

    // Get an app-specific folder (creates if needed)
    async getAppFolder(appName) {
        const folder = await this.getOrCreateFolder(appName, this.rootFolderId);
        return folder;
    }
}

// Make it available globally for other apps
window.SafePlaceStorage = SafePlaceStorage;

// ── Helpers ──

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '--';
    const num = parseInt(bytes, 10);
    if (isNaN(num)) return '--';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(1024));
    return (num / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function getFileIcon(name, mimeType) {
    if (mimeType === 'application/vnd.google-apps.folder') return '📁';
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
        pdf: '📄', doc: '📝', docx: '📝', txt: '📝', md: '📝',
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
        mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵', m4a: '🎵',
        mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬', webm: '🎬',
        zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
        js: '💻', ts: '💻', py: '💻', java: '💻', cpp: '💻', c: '💻',
        html: '🌐', css: '🎨', json: '📋', xml: '📋', csv: '📋',
        exe: '⚙️', msi: '⚙️', bat: '⚙️', sh: '⚙️',
        xls: '📊', xlsx: '📊', ppt: '📊', pptx: '📊',
    };
    return icons[ext] || '📎';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isFolder(file) {
    return file.mimeType === 'application/vnd.google-apps.folder';
}

// ── UI ──

let storage = null;

function showApp() {
    $('login-screen').style.display = 'none';
    $('app').style.display = 'block';
}

function showLogin() {
    $('login-screen').style.display = 'flex';
    $('app').style.display = 'none';
}

function renderBreadcrumb() {
    const bc = $('breadcrumb');
    bc.innerHTML = '';

    // Root
    const rootLink = document.createElement('a');
    rootLink.textContent = 'SafePlace';
    rootLink.onclick = () => navigateTo(state.rootFolderId, []);
    bc.appendChild(rootLink);

    for (let i = 0; i < state.folderPath.length; i++) {
        const sep = document.createElement('span');
        sep.textContent = ' / ';
        bc.appendChild(sep);

        const item = state.folderPath[i];
        if (i < state.folderPath.length - 1) {
            const link = document.createElement('a');
            link.textContent = item.name;
            link.onclick = () => navigateTo(item.id, state.folderPath.slice(0, i + 1));
            bc.appendChild(link);
        } else {
            const current = document.createElement('span');
            current.textContent = item.name;
            current.className = 'breadcrumb-current';
            bc.appendChild(current);
        }
    }
}

function navigateTo(folderId, path) {
    state.currentFolderId = folderId;
    state.folderPath = path;
    renderBreadcrumb();
    refreshFiles();
}

async function refreshFiles() {
    const list = $('file-list');
    list.innerHTML = '<div class="empty-state"><div class="spinner"></div> Loading...</div>';

    try {
        const files = await storage.listFiles(state.currentFolderId);

        if (files.length === 0) {
            list.innerHTML = '<p class="empty-state">Empty folder. Upload files or create a subfolder.</p>';
            return;
        }

        // Sort: folders first, then files
        files.sort((a, b) => {
            const aFolder = isFolder(a) ? 0 : 1;
            const bFolder = isFolder(b) ? 0 : 1;
            if (aFolder !== bFolder) return aFolder - bFolder;
            return a.name.localeCompare(b.name);
        });

        list.innerHTML = '';

        for (const file of files) {
            const item = document.createElement('div');
            item.className = 'file-item';

            if (isFolder(file)) {
                item.innerHTML = `
                    <span class="icon">📁</span>
                    <div class="info">
                        <div class="name">${escapeHtml(file.name)}</div>
                        <div class="meta">Folder</div>
                    </div>
                    <div class="actions">
                        <button class="action-btn delete" title="Delete folder">🗑️</button>
                    </div>
                `;
                item.onclick = () => {
                    const newPath = [...state.folderPath, { id: file.id, name: file.name }];
                    navigateTo(file.id, newPath);
                };
            } else {
                item.innerHTML = `
                    <span class="icon">${getFileIcon(file.name, file.mimeType)}</span>
                    <div class="info">
                        <div class="name">${escapeHtml(file.name)}</div>
                        <div class="meta">${formatSize(file.size)} · ${formatDate(file.modifiedTime)}</div>
                    </div>
                    <div class="actions">
                        <button class="action-btn download" title="Download">⬇️</button>
                        <button class="action-btn delete" title="Delete">🗑️</button>
                    </div>
                `;

                item.querySelector('.download').onclick = (e) => {
                    e.stopPropagation();
                    handleDownload(file.id, file.name);
                };
            }

            const deleteBtn = item.querySelector('.delete');
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                handleDelete(file.id, file.name, isFolder(file));
            };

            list.appendChild(item);
        }
    } catch (err) {
        list.innerHTML = `<p class="empty-state">Error: ${escapeHtml(err.message)}</p>`;
    }
}

// ── Google Auth ──

function initGoogleAuth() {
    state.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (response) => {
            if (response.error) {
                $('login-status').textContent = 'Sign-in failed: ' + response.error;
                $('login-status').className = 'status error';
                return;
            }
            state.accessToken = response.access_token;

            try {
                // Get user info
                const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: { 'Authorization': `Bearer ${state.accessToken}` },
                });
                const user = await userRes.json();
                state.userEmail = user.email;
                $('user-email').textContent = user.email;

                // Initialize storage
                storage = new SafePlaceStorage(state.accessToken, null);

                // Find or create root SafePlace folder
                const rootFolder = await storage.getOrCreateFolder(ROOT_FOLDER_NAME, 'root');
                state.rootFolderId = rootFolder.id;
                state.currentFolderId = rootFolder.id;
                storage.rootFolderId = rootFolder.id;

                // Expose storage globally for other apps
                window.safePlace = storage;

                showApp();
                renderBreadcrumb();
                refreshFiles();
            } catch (err) {
                $('login-status').textContent = 'Error: ' + err.message;
                $('login-status').className = 'status error';
                state.accessToken = null;
            }
        },
    });
}

function handleSignIn() {
    if (!state.tokenClient) {
        $('login-status').textContent = 'Google API not loaded yet. Please wait...';
        $('login-status').className = 'status error';
        return;
    }
    state.tokenClient.requestAccessToken({ prompt: 'consent' });
}

function handleSignOut() {
    if (state.accessToken) {
        google.accounts.oauth2.revoke(state.accessToken);
    }
    state.accessToken = null;
    state.rootFolderId = null;
    state.currentFolderId = null;
    state.folderPath = [];
    state.userEmail = null;
    storage = null;
    window.safePlace = null;
    showLogin();
}

// ── Handlers ──

async function handleUpload(files) {
    if (!storage) return;

    const progress = $('upload-progress');

    for (const file of files) {
        const itemEl = document.createElement('div');
        itemEl.className = 'progress-item';
        itemEl.innerHTML = `
            <span class="name">${escapeHtml(file.name)}</span>
            <span class="status-icon uploading"><span class="spinner"></span></span>
        `;
        progress.appendChild(itemEl);

        try {
            await storage.uploadFile(file, state.currentFolderId);
            itemEl.querySelector('.status-icon').innerHTML = '✅';
            itemEl.querySelector('.status-icon').className = 'status-icon done';
        } catch (err) {
            itemEl.querySelector('.status-icon').innerHTML = '❌';
            itemEl.querySelector('.status-icon').className = 'status-icon failed';
            itemEl.title = err.message;
        }
    }

    refreshFiles();

    setTimeout(() => {
        progress.innerHTML = '';
    }, 3000);
}

async function handleDownload(fileId, fileName) {
    try {
        const blob = await storage.downloadFile(fileId);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Download failed: ' + err.message);
    }
}

async function handleDelete(fileId, fileName, folder) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
        <div class="confirm-dialog">
            <h3>Delete ${folder ? 'folder' : 'file'}?</h3>
            <p>Are you sure you want to delete <strong>${escapeHtml(fileName)}</strong>${folder ? ' and all its contents' : ''}?</p>
            <div class="btn-group">
                <button class="btn btn-small cancel-btn">Cancel</button>
                <button class="btn btn-danger confirm-btn">Delete</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    return new Promise((resolve) => {
        overlay.querySelector('.cancel-btn').onclick = () => {
            document.body.removeChild(overlay);
            resolve();
        };
        overlay.querySelector('.confirm-btn').onclick = async () => {
            try {
                await storage.deleteFile(fileId);
                document.body.removeChild(overlay);
                refreshFiles();
            } catch (err) {
                alert('Delete failed: ' + err.message);
                document.body.removeChild(overlay);
            }
            resolve();
        };
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                resolve();
            }
        };
    });
}

async function handleNewFolder() {
    const name = prompt('Folder name:');
    if (!name || !name.trim()) return;

    try {
        await storage.getOrCreateFolder(name.trim(), state.currentFolderId);
        refreshFiles();
    } catch (err) {
        alert('Failed to create folder: ' + err.message);
    }
}

// ── Init ──

function waitForGoogleApi() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        initGoogleAuth();
    } else {
        setTimeout(waitForGoogleApi, 200);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    $('signin-btn').addEventListener('click', handleSignIn);
    $('signout-btn').addEventListener('click', handleSignOut);
    $('refresh-btn').addEventListener('click', refreshFiles);
    $('new-folder-btn').addEventListener('click', handleNewFolder);

    // File upload
    const dropZone = $('drop-zone');
    const fileInput = $('file-input');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleUpload(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleUpload(fileInput.files);
            fileInput.value = '';
        }
    });

    waitForGoogleApi();
});

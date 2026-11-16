// Safe Place - Encrypted File Storage on GitHub
// All encryption happens client-side using AES-256-GCM via Web Crypto API

const UPLOADS_PATH = 'uploads';
const SALT = new TextEncoder().encode('safe-place-v1');

// ── State ──
let state = {
    passkey: null,
    cryptoKey: null,
    token: null,
    repo: null,
    user: null,
    currentPath: UPLOADS_PATH,
};

// ── DOM refs ──
const $ = (id) => document.getElementById(id);

// ── Crypto helpers ──

async function deriveKey(passkey) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passkey),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptData(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
    );
    // Prepend IV to ciphertext
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);
    return result;
}

async function decryptData(data, key) {
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);
    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );
}

// ── Passkey verification ──
// We store a known encrypted marker in localStorage to verify the passkey

const MARKER_KEY = 'safe-place-marker';
const MARKER_TEXT = 'safe-place-unlocked';

async function setPasskeyMarker(key) {
    const encrypted = await encryptData(new TextEncoder().encode(MARKER_TEXT), key);
    localStorage.setItem(MARKER_KEY, arrayToBase64(encrypted));
}

async function verifyPasskey(key) {
    const stored = localStorage.getItem(MARKER_KEY);
    if (!stored) return null; // First time -- no marker yet
    try {
        const data = base64ToArray(stored);
        const decrypted = await decryptData(data, key);
        const text = new TextDecoder().decode(decrypted);
        return text === MARKER_TEXT;
    } catch {
        return false;
    }
}

// ── Base64 helpers ──

function arrayToBase64(arr) {
    let binary = '';
    for (let i = 0; i < arr.length; i++) {
        binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary);
}

function base64ToArray(b64) {
    const binary = atob(b64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        arr[i] = binary.charCodeAt(i);
    }
    return arr;
}

// ── GitHub API ──

async function ghApi(path, options = {}) {
    const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            ...(state.token ? { 'Authorization': `token ${state.token}` } : {}),
            ...options.headers,
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `GitHub API error: ${res.status}`);
    }
    return res.json();
}

async function getUser() {
    return ghApi('/user');
}

async function listFiles(path) {
    try {
        return await ghApi(`/repos/${state.repo}/contents/${path}`);
    } catch {
        return [];
    }
}

async function uploadFile(path, content, message) {
    // Check if file exists (to get sha for update)
    let sha;
    try {
        const existing = await ghApi(`/repos/${state.repo}/contents/${path}`);
        sha = existing.sha;
    } catch {
        // File doesn't exist yet
    }

    const body = {
        message,
        content: arrayToBase64(content),
    };
    if (sha) body.sha = sha;

    return ghApi(`/repos/${state.repo}/contents/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function deleteFile(path, sha) {
    return ghApi(`/repos/${state.repo}/contents/${path}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: `Delete ${path.split('/').pop()}`,
            sha,
        }),
    });
}

async function downloadFile(url) {
    const res = await fetch(url, {
        headers: state.token ? { 'Authorization': `token ${state.token}` } : {},
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
}

// ── File size formatting ──

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

// ── File type icons ──

function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
        pdf: '📄', doc: '📝', docx: '📝', txt: '📝',
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
        mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
        mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬',
        zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
        js: '💻', ts: '💻', py: '💻', java: '💻', cpp: '💻', c: '💻',
        html: '🌐', css: '🎨', json: '📋', xml: '📋',
        exe: '⚙️', msi: '⚙️', bat: '⚙️', sh: '⚙️',
    };
    return icons[ext] || '📎';
}

// ── UI Updates ──

function showApp() {
    $('lock-screen').style.display = 'none';
    $('app').style.display = 'block';
}

function showLockScreen() {
    $('lock-screen').style.display = 'flex';
    $('app').style.display = 'none';
    $('passkey-input').value = '';
    $('passkey-input').focus();
}

function updateAuthUI() {
    if (state.token && state.user) {
        $('auth-section').style.display = 'none';
        $('connected-section').style.display = 'block';
        $('upload-section').style.display = 'block';
        $('connected-user').textContent = `✅ Connected as ${state.user.login} to ${state.repo}`;
    } else {
        $('auth-section').style.display = 'block';
        $('connected-section').style.display = 'none';
        $('upload-section').style.display = 'none';
    }
}

function renderBreadcrumb() {
    const parts = state.currentPath.split('/');
    const bc = $('path-breadcrumb');
    bc.innerHTML = '';

    parts.forEach((part, i) => {
        if (i > 0) {
            const sep = document.createElement('span');
            sep.textContent = ' / ';
            bc.appendChild(sep);
        }

        if (i < parts.length - 1) {
            const link = document.createElement('a');
            link.textContent = part;
            link.onclick = () => {
                state.currentPath = parts.slice(0, i + 1).join('/');
                refreshFiles();
            };
            bc.appendChild(link);
        } else {
            const current = document.createElement('span');
            current.textContent = part;
            current.style.color = 'var(--text)';
            bc.appendChild(current);
        }
    });
}

async function refreshFiles() {
    const list = $('file-list');
    list.innerHTML = '<div class="empty-state"><div class="spinner"></div> Loading...</div>';
    renderBreadcrumb();

    try {
        const files = await listFiles(state.currentPath);

        if (!Array.isArray(files) || files.length === 0) {
            list.innerHTML = '<p class="empty-state">No files yet. Upload something!</p>';
            return;
        }

        // Sort: folders first, then files alphabetically
        files.sort((a, b) => {
            if (a.type === 'dir' && b.type !== 'dir') return -1;
            if (a.type !== 'dir' && b.type === 'dir') return 1;
            return a.name.localeCompare(b.name);
        });

        list.innerHTML = '';

        // Add "go up" if not at root uploads path
        if (state.currentPath !== UPLOADS_PATH) {
            const upItem = document.createElement('div');
            upItem.className = 'file-item';
            upItem.innerHTML = `
                <span class="icon">⬆️</span>
                <div class="info"><div class="name">..</div></div>
            `;
            upItem.onclick = () => {
                const parts = state.currentPath.split('/');
                parts.pop();
                state.currentPath = parts.join('/');
                refreshFiles();
            };
            list.appendChild(upItem);
        }

        for (const file of files) {
            // Skip non-encrypted metadata files
            const item = document.createElement('div');
            item.className = 'file-item';

            if (file.type === 'dir') {
                item.innerHTML = `
                    <span class="icon">📁</span>
                    <div class="info">
                        <div class="name">${escapeHtml(file.name)}</div>
                    </div>
                `;
                item.onclick = () => {
                    state.currentPath = file.path;
                    refreshFiles();
                };
            } else {
                // Encrypted files have .enc extension; display original name
                const displayName = file.name.endsWith('.enc')
                    ? file.name.slice(0, -4)
                    : file.name;

                item.innerHTML = `
                    <span class="icon">${getFileIcon(displayName)}</span>
                    <div class="info">
                        <div class="name">${escapeHtml(displayName)}</div>
                        <div class="meta">${formatSize(file.size)}</div>
                    </div>
                    <div class="actions">
                        <button class="action-btn download" title="Download & decrypt">⬇️</button>
                        ${state.token ? `<button class="action-btn delete" title="Delete">🗑️</button>` : ''}
                    </div>
                `;

                const downloadBtn = item.querySelector('.download');
                downloadBtn.onclick = (e) => {
                    e.stopPropagation();
                    handleDownload(file, displayName);
                };

                const deleteBtn = item.querySelector('.delete');
                if (deleteBtn) {
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        handleDelete(file, displayName);
                    };
                }
            }

            list.appendChild(item);
        }
    } catch (err) {
        list.innerHTML = `<p class="empty-state">Error loading files: ${escapeHtml(err.message)}</p>`;
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ── Handlers ──

async function handleUnlock() {
    const passkey = $('passkey-input').value.trim();
    if (!passkey) {
        $('lock-error').textContent = 'Please enter a passkey';
        return;
    }

    try {
        const key = await deriveKey(passkey);
        const verified = await verifyPasskey(key);

        if (verified === false) {
            $('lock-error').textContent = 'Wrong passkey. Try again.';
            $('passkey-input').value = '';
            $('passkey-input').focus();
            return;
        }

        if (verified === null) {
            // First time -- set the marker
            await setPasskeyMarker(key);
        }

        state.passkey = passkey;
        state.cryptoKey = key;

        // Restore saved GitHub connection
        const savedToken = localStorage.getItem('safe-place-token');
        const savedRepo = localStorage.getItem('safe-place-repo');
        if (savedToken && savedRepo) {
            state.token = savedToken;
            state.repo = savedRepo;
            try {
                state.user = await getUser();
            } catch {
                // Token expired or invalid
                state.token = null;
                state.repo = null;
                localStorage.removeItem('safe-place-token');
                localStorage.removeItem('safe-place-repo');
            }
        }

        showApp();
        updateAuthUI();

        if (state.token) {
            refreshFiles();
        }
    } catch (err) {
        $('lock-error').textContent = 'Error: ' + err.message;
    }
}

async function handleConnect() {
    const token = $('token-input').value.trim();
    const repo = $('repo-input').value.trim();
    const status = $('auth-status');

    if (!token || !repo) {
        status.textContent = 'Please fill in both fields';
        status.className = 'status error';
        return;
    }

    if (!repo.includes('/')) {
        status.textContent = 'Repo format: username/repo-name';
        status.className = 'status error';
        return;
    }

    status.innerHTML = '<span class="spinner"></span> Connecting...';
    status.className = 'status';

    try {
        state.token = token;
        state.repo = repo;
        state.user = await getUser();

        // Ensure uploads folder exists
        try {
            await listFiles(UPLOADS_PATH);
        } catch {
            // Create uploads folder with a .gitkeep
            await uploadFile(
                `${UPLOADS_PATH}/.gitkeep`,
                new TextEncoder().encode(''),
                'Initialize uploads folder'
            );
        }

        // Save connection (encrypted token would be better, but localStorage is per-origin)
        localStorage.setItem('safe-place-token', token);
        localStorage.setItem('safe-place-repo', repo);

        $('token-input').value = '';
        updateAuthUI();
        refreshFiles();
    } catch (err) {
        status.textContent = 'Connection failed: ' + err.message;
        status.className = 'status error';
        state.token = null;
        state.repo = null;
        state.user = null;
    }
}

function handleDisconnect() {
    state.token = null;
    state.repo = null;
    state.user = null;
    localStorage.removeItem('safe-place-token');
    localStorage.removeItem('safe-place-repo');
    updateAuthUI();
    $('file-list').innerHTML = '<p class="empty-state">Connect to GitHub to browse files</p>';
}

function handleLock() {
    state.passkey = null;
    state.cryptoKey = null;
    state.token = null;
    state.repo = null;
    state.user = null;
    showLockScreen();
}

async function handleUpload(files) {
    if (!state.token || !state.cryptoKey) return;

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
            // Read file
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);

            // Encrypt
            const encrypted = await encryptData(data, state.cryptoKey);

            // Upload to GitHub
            const filePath = `${state.currentPath}/${file.name}.enc`;
            await uploadFile(filePath, encrypted, `Upload ${file.name}`);

            itemEl.querySelector('.status-icon').innerHTML = '✅';
            itemEl.querySelector('.status-icon').className = 'status-icon done';
        } catch (err) {
            itemEl.querySelector('.status-icon').innerHTML = '❌';
            itemEl.querySelector('.status-icon').className = 'status-icon failed';
            itemEl.title = err.message;
        }
    }

    // Refresh file list after all uploads
    refreshFiles();

    // Clear progress after a delay
    setTimeout(() => {
        progress.innerHTML = '';
    }, 3000);
}

async function handleDownload(file, displayName) {
    if (!state.cryptoKey) return;

    try {
        // Download encrypted content
        const encryptedB64 = await ghApi(`/repos/${state.repo}/contents/${file.path}`);
        const encrypted = base64ToArray(encryptedB64.content.replace(/\n/g, ''));

        // Decrypt
        const decrypted = await decryptData(encrypted, state.cryptoKey);

        // Trigger download
        const blob = new Blob([decrypted]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = displayName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        alert('Download failed: ' + err.message + '\n\nMake sure you are using the correct passkey.');
    }
}

async function handleDelete(file, displayName) {
    // Show confirm dialog
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
        <div class="confirm-dialog">
            <h3>Delete file?</h3>
            <p>Are you sure you want to delete <strong>${escapeHtml(displayName)}</strong>?</p>
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
                await deleteFile(file.path, file.sha);
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

// ── Event listeners ──

document.addEventListener('DOMContentLoaded', () => {
    // Passkey unlock
    $('unlock-btn').addEventListener('click', handleUnlock);
    $('passkey-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleUnlock();
    });

    // Lock button
    $('lock-btn').addEventListener('click', handleLock);

    // GitHub auth
    $('connect-btn').addEventListener('click', handleConnect);
    $('disconnect-btn').addEventListener('click', handleDisconnect);

    // Refresh
    $('refresh-btn').addEventListener('click', refreshFiles);

    // File upload -- drop zone
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

    // Restore repo input from saved value
    const savedRepo = localStorage.getItem('safe-place-repo');
    if (savedRepo) {
        $('repo-input').value = savedRepo;
    }

    // Focus passkey input
    $('passkey-input').focus();
});

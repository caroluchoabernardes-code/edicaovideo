// Google Drive em modo SOMENTE LEITURA (escopo drive.readonly).
// O app só lista e baixa cópias dos vídeos — nunca altera, move ou apaga nada no Drive.
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const store = require('./store');

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const CREDENTIALS_FILE = path.join(store.paths.ROOT, 'credentials.json');
const TOKEN_FILE = path.join(store.paths.ROOT, 'token.json');

function hasCredentials() {
  return fs.existsSync(CREDENTIALS_FILE);
}

function client(port) {
  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
  const c = raw.web || raw.installed;
  if (!c) throw new Error('credentials.json inválido');
  const redirect = `http://localhost:${port}/oauth2callback`;
  const auth = new google.auth.OAuth2(c.client_id, c.client_secret, redirect);
  if (fs.existsSync(TOKEN_FILE)) {
    auth.setCredentials(JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')));
  }
  auth.on('tokens', (t) => {
    const prev = fs.existsSync(TOKEN_FILE) ? JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')) : {};
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...prev, ...t }, null, 2));
  });
  return auth;
}

function isConnected() {
  return hasCredentials() && fs.existsSync(TOKEN_FILE);
}

function authUrl(port) {
  return client(port).generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
}

async function saveCode(port, code) {
  const auth = client(port);
  const { tokens } = await auth.getToken(code);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

// Aceita o link da pasta do Drive ou só o ID.
function folderIdFrom(input) {
  if (!input) return null;
  const m = String(input).match(/folders\/([a-zA-Z0-9_-]+)/) || String(input).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(input.trim()) ? input.trim() : null;
}

// Lista vídeos da pasta e subpastas.
async function listVideos(port, folderId) {
  const drive = google.drive({ version: 'v3', auth: client(port) });
  const out = [];
  const queue = [{ id: folderId, path: '' }];
  while (queue.length) {
    const { id, path: parent } = queue.shift();
    let pageToken;
    do {
      const res = await drive.files.list({
        q: `'${id}' in parents and trashed = false and (mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder')`,
        fields: 'nextPageToken, files(id, name, mimeType, size, md5Checksum, createdTime, modifiedTime)',
        pageSize: 200,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of res.data.files) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          queue.push({ id: f.id, path: parent ? `${parent}/${f.name}` : f.name });
        } else {
          out.push({ ...f, folderPath: parent });
        }
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }
  return out;
}

async function download(port, file, dest) {
  const drive = google.drive({ version: 'v3', auth: client(port) });
  const res = await drive.files.get(
    { fileId: file.id, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );
  const tmp = dest + '.part';
  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(tmp);
    res.data.on('error', reject).pipe(w).on('error', reject).on('finish', resolve);
  });
  fs.renameSync(tmp, dest);
  return dest;
}

module.exports = { hasCredentials, isConnected, authUrl, saveCode, folderIdFrom, listVideos, download };

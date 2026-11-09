// Armazenamento local simples em JSON (pasta data/, fora do Git).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const THUMBS_DIR = path.join(DATA_DIR, 'thumbs');
const LIBRARY_DIR = path.join(ROOT, 'library', 'drive');
const DB_FILE = path.join(DATA_DIR, 'triagem.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

for (const d of [DATA_DIR, THUMBS_DIR, LIBRARY_DIR]) fs.mkdirSync(d, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const store = {
  paths: { ROOT, DATA_DIR, THUMBS_DIR, LIBRARY_DIR },
  getVideos: () => readJson(DB_FILE, []),
  saveVideos: (list) => writeJson(DB_FILE, list),
  getConfig: () => readJson(CONFIG_FILE, { localFolder: '', driveFolder: '' }),
  saveConfig: (cfg) => writeJson(CONFIG_FILE, cfg),
};

module.exports = store;

const fs = require('fs');
const path = require('path');

function resolveUploadRoot() {
  const configured = process.env.UPLOAD_ROOT || process.env.UPLOAD_PATH || '';
  const resolved = configured
    ? path.resolve(configured)
    : path.join(__dirname, '..', 'uploads');

  // Older configs sometimes used UPLOAD_PATH=./uploads/soal.
  // The public /uploads route must point to the parent uploads folder.
  return path.basename(resolved).toLowerCase() === 'soal'
    ? path.dirname(resolved)
    : resolved;
}

const uploadRoot = resolveUploadRoot();

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getUploadRoot() {
  return ensureDir(uploadRoot);
}

function getUploadDir(...segments) {
  return ensureDir(path.join(uploadRoot, ...segments.filter(Boolean)));
}

function resolvePublicUploadPath(publicPath = '') {
  const normalized = String(publicPath || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/?uploads\/?/, '')
    .replace(/^\/+/, '');

  return path.join(uploadRoot, normalized);
}

module.exports = {
  getUploadRoot,
  getUploadDir,
  resolvePublicUploadPath
};

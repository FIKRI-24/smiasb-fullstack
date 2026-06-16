const fs = require('fs');
const path = require('path');

function resolveUploadRoot() {
  const configured = process.env.UPLOAD_ROOT || process.env.UPLOAD_PATH || '';
  const resolved = configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), 'uploads');

  // Older configs sometimes used UPLOAD_PATH=./uploads/soal.
  // The public /uploads route must point to the parent uploads folder.
  return path.basename(resolved).toLowerCase() === 'soal'
    ? path.dirname(resolved)
    : resolved;
}

const uploadRoot = resolveUploadRoot();
const legacyUploadRoots = [
  uploadRoot,
  path.join(__dirname, '..', 'uploads')
];

function uniqueExistingRoots(roots) {
  const seen = new Set();

  return roots
    .map(root => path.resolve(root))
    .filter((root) => {
      if (seen.has(root)) return false;
      seen.add(root);
      return true;
    });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getUploadRoot() {
  return ensureDir(uploadRoot);
}

function getUploadRoots() {
  return uniqueExistingRoots(legacyUploadRoots).map(ensureDir);
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

function resolveExistingPublicUploadPath(publicPath = '') {
  const normalized = String(publicPath || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/?uploads\/?/, '')
    .replace(/^\/+/, '');

  const candidates = getUploadRoots().map(root => path.join(root, normalized));
  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

module.exports = {
  getUploadRoot,
  getUploadRoots,
  getUploadDir,
  resolvePublicUploadPath,
  resolveExistingPublicUploadPath
};

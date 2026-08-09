'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function atomicWriteFileSync(targetPath, data, options = {}) {
  const dirPath = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const encoding = typeof options === 'string' ? options : options.encoding;
  const existingMode = (() => {
    try { return fs.statSync(targetPath).mode & 0o777; } catch { return undefined; }
  })();
  const tempPath = path.join(
    dirPath,
    `.${baseName}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
  );

  let fd;
  try {
    fd = fs.openSync(tempPath, 'wx', existingMode ?? 0o666);
    fs.writeFileSync(fd, data, encoding ? { encoding } : undefined);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;

    if (existingMode !== undefined) fs.chmodSync(tempPath, existingMode);
    fs.renameSync(tempPath, targetPath);
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* best effort */ }
    }
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch { /* ursprünglichen Fehler beibehalten */ }
    throw error;
  }
}


function atomicCopyFileSync(sourcePath, targetPath) {
  const dirPath = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const tempPath = path.join(
    dirPath,
    `.${baseName}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
  );

  let fd;
  try {
    fs.copyFileSync(sourcePath, tempPath, fs.constants.COPYFILE_EXCL);
    fd = fs.openSync(tempPath, 'r');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tempPath, targetPath);
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* best effort */ }
    }
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch { /* ursprünglichen Fehler beibehalten */ }
    throw error;
  }
}

module.exports = { atomicWriteFileSync, atomicCopyFileSync };

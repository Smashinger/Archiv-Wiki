import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { CRX_FILENAME, inspectCrxFile } = require('../main/webclip-distribution.js');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagedCrxPath = path.join(projectRoot, 'extension', 'distribution', 'chromium', CRX_FILENAME);

try {
  const metadata = inspectCrxFile(stagedCrxPath);
  console.log(`Web-Clipper-CRX geprüft: ${metadata.extensionId}, Version ${metadata.extensionVersion}, CRX${metadata.formatVersion}`);
} catch (error) {
  console.error('Der AppImage-Build benötigt die bereits signierte Web-Clipper-CRX an diesem Staging-Pfad:');
  console.error(stagedCrxPath);
  console.error(error?.message || error);
  process.exitCode = 1;
}

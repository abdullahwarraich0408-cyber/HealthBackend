const logger = require('../../utils/logger');

const MAX_BYTES = 12 * 1024 * 1024;

async function fetchImageAsBase64(fileUrl) {
  const response = await fetch(fileUrl, {
    headers: { Accept: 'image/*,application/pdf' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Could not fetch prescription image (${response.status})`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > MAX_BYTES) {
    throw new Error('Prescription file is too large for OCR (max 12 MB)');
  }

  if (contentType.includes('pdf')) {
    throw new Error(
      'PDF prescriptions are stored but OCR currently supports photos only. Re-upload as JPG/PNG for auto-reading.',
    );
  }

  return {
    base64: buffer.toString('base64'),
    mimeType: contentType.split(';')[0].trim() || 'image/jpeg',
    sizeBytes: buffer.length,
  };
}

async function safeFetchImage(fileUrl) {
  try {
    return await fetchImageAsBase64(fileUrl);
  } catch (err) {
    logger.warn('Prescription image fetch failed', {
      fileUrl,
      error: err.message,
    });
    throw err;
  }
}

module.exports = { fetchImageAsBase64, safeFetchImage };

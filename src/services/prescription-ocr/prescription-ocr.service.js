const env = require('../../config/env');
const logger = require('../../utils/logger');
const { safeFetchImage } = require('./fetchImage');
const { extractWithOpenAiVision } = require('./openai-vision.provider');
const { extractWithGoogleVision } = require('./google-vision.provider');

function resolveProvider() {
  const configured = (env.PRESCRIPTION_OCR_PROVIDER || 'auto').toLowerCase();
  if (configured === 'stub') return 'stub';
  if (configured === 'google') return 'google';
  if (configured === 'openai') return 'openai';
  if (configured === 'google+openai') return 'google';

  // auto: prefer OpenAI vision (best on handwriting), then Google, then stub
  if (env.OPENAI_API_KEY?.trim()) return 'openai';
  if (env.GOOGLE_VISION_API_KEY?.trim()) return 'google';
  return 'stub';
}

function stubResult(fileUrl, note) {
  return {
    source: fileUrl,
    extracted_at: new Date().toISOString(),
    provider: 'stub',
    doctor: null,
    clinic: null,
    prescription_date: null,
    medicines: [],
    raw_text: null,
    confidence: 'low',
    note:
      note ||
      'OCR not configured. Set OPENAI_API_KEY (recommended) or GOOGLE_VISION_API_KEY in Backend/.env',
  };
}

async function extractPrescriptionFromFile(fileUrl) {
  const provider = resolveProvider();

  if (provider === 'stub') {
    logger.info('Prescription OCR using stub (no API keys configured)');
    return stubResult(fileUrl);
  }

  let image;
  try {
    image = await safeFetchImage(fileUrl);
  } catch (err) {
    return {
      ...stubResult(fileUrl, err.message),
      error: err.message,
    };
  }

  try {
    if (provider === 'openai') {
      const result = await extractWithOpenAiVision({
        fileUrl,
        base64: image.base64,
        mimeType: image.mimeType,
      });
      if (result) return result;
    }

    if (provider === 'google') {
      const result = await extractWithGoogleVision({
        fileUrl,
        base64: image.base64,
      });
      if (result) return result;
    }
  } catch (err) {
    logger.error('Prescription OCR provider failed', {
      provider,
      error: err.message,
    });
    return {
      ...stubResult(fileUrl, `OCR failed: ${err.message}. Upload saved — add medicines manually.`),
      error: err.message,
    };
  }

  return stubResult(fileUrl);
}

module.exports = {
  extractPrescriptionFromFile,
  resolveProvider,
};

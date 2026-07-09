const env = require('../../config/env');
const logger = require('../../utils/logger');
const { structureFromText } = require('./parseStructured');
const { normalizeOcrResult } = require('./normalize');

async function extractTextWithGoogleVision(base64) {
  const apiKey = env.GOOGLE_VISION_API_KEY?.trim();
  if (!apiKey) return null;

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || `Google Vision failed (${response.status})`;
    throw new Error(message);
  }

  return payload.responses?.[0]?.fullTextAnnotation?.text || '';
}

async function extractWithGoogleVision({ fileUrl, base64 }) {
  const rawText = await extractTextWithGoogleVision(base64);
  if (!rawText?.trim()) {
    return normalizeOcrResult(
      { medicines: [], confidence: 'low' },
      { provider: 'google-vision', source: fileUrl, rawText: '' },
    );
  }

  try {
    const structured = await structureFromText({
      rawText,
      fileUrl,
      provider: 'google-vision+openai',
    });
    if (structured) return structured;
  } catch (err) {
    logger.warn('OpenAI parse of Google Vision text failed', { error: err.message });
  }

  return normalizeOcrResult(
    { medicines: [], confidence: 'low', raw_text: rawText },
    { provider: 'google-vision', source: fileUrl, rawText },
  );
}

module.exports = { extractWithGoogleVision };

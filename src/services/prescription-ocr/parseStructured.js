const OpenAI = require('openai');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { STRUCTURE_PROMPT } = require('./prompts');
const { normalizeOcrResult } = require('./normalize');

function getClient() {
  if (!env.OPENAI_API_KEY?.trim()) return null;
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

function getParseModel() {
  return env.OPENAI_OCR_PARSE_MODEL || env.OPENAI_VISION_MODEL || 'gpt-4o';
}

async function parsePrescriptionText(rawText, { diagnosisHint = null } = {}) {
  const client = getClient();
  if (!client || !rawText?.trim()) return null;

  const userContent = diagnosisHint
    ? `Diagnosis hint from image: ${diagnosisHint}\n\nPrescription text:\n${rawText.slice(0, 14_000)}`
    : rawText.slice(0, 14_000);

  try {
    const response = await client.chat.completions.create({
      model: getParseModel(),
      temperature: 0.05,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: STRUCTURE_PROMPT },
        { role: 'user', content: userContent },
      ],
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (err) {
    logger.warn('Prescription structured parse failed', { error: err.message });
    throw err;
  }
}

async function structureFromText({ rawText, diagnosisHint, fileUrl, provider }) {
  const parsed = await parsePrescriptionText(rawText, { diagnosisHint });
  if (!parsed) return null;

  parsed.raw_text = rawText;
  if (!parsed.diagnosis && diagnosisHint) parsed.diagnosis = diagnosisHint;

  return normalizeOcrResult(parsed, {
    provider,
    source: fileUrl,
    rawText,
  });
}

module.exports = { parsePrescriptionText, structureFromText, getParseModel };

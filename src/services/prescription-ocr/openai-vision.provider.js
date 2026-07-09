const OpenAI = require('openai');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { TRANSCRIBE_PROMPT } = require('./prompts');
const { structureFromText } = require('./parseStructured');
const { normalizeOcrResult } = require('./normalize');

const SINGLE_PASS_PROMPT = `You extract structured prescription data from medical prescription images (Pakistan / South Asia).

Read printed AND handwritten text. Support English, Urdu script, and Roman Urdu.

For each medicine extract: name, dose, frequency (morning/afternoon/night tokens), instructions, duration, purpose (why prescribed), purpose_source (prescription|inferred|unknown).
Also extract lab_tests: array of investigation names written on the Rx (CBC, LFT, etc.) — empty array if none.

Purpose rules:
- Use diagnosis section, "For", "Indication", "Dx", or per-medicine notes when written on the Rx.
- Set purpose_source to "prescription" when explicitly written.
- Use "inferred" only when diagnosis clearly applies to that medicine line.
- Use "unknown" when not determinable — do NOT guess from drug name alone.

Frequency: 1-0-1=morning+night, 1-1-1=all three, OD=morning, BD=morning+night, TDS=all three, HS=night.

Do NOT invent medicines. Return JSON:
{
  "doctor": null,
  "clinic": null,
  "prescription_date": null,
  "diagnosis": null,
  "confidence": "high|medium|low",
  "lab_tests": [],
  "medicines": [{"name":"","dose":"","frequency":[],"instructions":"","duration":"","purpose":"","purpose_source":"unknown"}],
  "raw_text": "transcription of all visible text"
}`;

function getClient() {
  if (!env.OPENAI_API_KEY?.trim()) return null;
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

function getVisionModel() {
  return env.OPENAI_VISION_MODEL || 'gpt-4o';
}

function useTwoPass() {
  const flag = env.PRESCRIPTION_OCR_TWO_PASS;
  return flag !== 'false' && flag !== '0';
}

async function transcribeImage(client, { base64, mimeType }) {
  const model = getVisionModel();
  const response = await client.chat.completions.create({
    model,
    temperature: 0.05,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: TRANSCRIBE_PROMPT },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
              detail: 'high',
            },
          },
        ],
      },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) return null;
  return JSON.parse(content);
}

async function extractSinglePass(client, { fileUrl, base64, mimeType }) {
  const model = getVisionModel();
  const response = await client.chat.completions.create({
    model,
    temperature: 0.05,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: SINGLE_PASS_PROMPT },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
              detail: 'high',
            },
          },
        ],
      },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = JSON.parse(content);
  return normalizeOcrResult(parsed, {
    provider: `openai-vision:${model}`,
    source: fileUrl,
    rawText: parsed.raw_text,
  });
}

async function extractWithOpenAiVision({ fileUrl, base64, mimeType }) {
  const client = getClient();
  if (!client) return null;

  const model = getVisionModel();

  try {
    if (useTwoPass()) {
      const transcription = await transcribeImage(client, { base64, mimeType });
      if (!transcription?.raw_text?.trim()) {
        logger.warn('Prescription transcription empty, falling back to single-pass');
        return extractSinglePass(client, { fileUrl, base64, mimeType });
      }

      const structured = await structureFromText({
        rawText: transcription.raw_text,
        diagnosisHint: transcription.diagnosis,
        fileUrl,
        provider: `openai-two-pass:${model}+${env.OPENAI_OCR_PARSE_MODEL || model}`,
      });

      if (structured) return structured;
      return extractSinglePass(client, { fileUrl, base64, mimeType });
    }

    return extractSinglePass(client, { fileUrl, base64, mimeType });
  } catch (err) {
    logger.warn('OpenAI vision prescription OCR failed', { error: err.message });
    throw err;
  }
}

module.exports = { extractWithOpenAiVision };

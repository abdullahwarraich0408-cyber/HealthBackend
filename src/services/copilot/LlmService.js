/**
 * OpenAI integration for Health Copilot.
 * Falls back gracefully when OPENAI_API_KEY is not set.
 */

const OpenAI = require('openai');
const env = require('../../config/env');
const logger = require('../../utils/logger');

let client = null;

function isEnabled() {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

function getClient() {
  if (!isEnabled()) return null;
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

const SYSTEM_PROMPT = `You are Medzoos Health Copilot for patients in Pakistan.
Rules:
- Never diagnose. Use educational language only.
- For emergencies (chest pain with red flags, severe bleeding, can't breathe), urge calling 1122 immediately.
- Always end with a clear next action (book doctor, book lab, order medicine, emergency).
- Be warm, concise, and personalized using the patient context provided.
- Output valid JSON only, no markdown.`;

async function generateCopilotTurn({ context, session, userMessage, ruleBasedResult }) {
  const openai = getClient();
  if (!openai) return null;

  const payload = {
    patient: {
      name: context.personal?.firstName,
      age: context.personal?.age,
      conditions: context.conditions,
      upcomingAppointments: context.upcomingAppointments,
      insights: context.insights,
    },
    session: {
      phase: session.phase,
      intent: session.intent,
      answers: session.answers,
      riskLevel: session.riskLevel,
    },
    userMessage,
    ruleBased: {
      riskLevel: ruleBasedResult?.riskLevel,
      differentials: ruleBasedResult?.differentials,
      reasoning: ruleBasedResult?.reasoning,
      actions: ruleBasedResult?.actions?.map((a) => a.label),
    },
  };

  try {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Respond with JSON: {"text":"assistant message","suggestedReplies":["..."],"reasoning":["..."]}. Context: ${JSON.stringify(payload)}`,
        },
      ],
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    logger.warn('OpenAI copilot call failed, using rule-based fallback', {
      error: err.message,
    });
    return null;
  }
}

async function enhanceGreeting(context, baseGreeting) {
  const openai = getClient();
  if (!openai) return baseGreeting;

  try {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Write a 2-4 sentence personalized health greeting for ${context.personal.firstName}. Context: ${JSON.stringify({
            insights: context.insights,
            conditions: context.conditions,
            upcomingAppointments: context.upcomingAppointments,
          })}. End with "How can I help you today?" Plain text only.`,
        },
      ],
    });
    return response.choices?.[0]?.message?.content?.trim() || baseGreeting;
  } catch (err) {
    logger.warn('OpenAI greeting failed', { error: err.message });
    return baseGreeting;
  }
}

module.exports = { isEnabled, generateCopilotTurn, enhanceGreeting };

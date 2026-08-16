/**
 * AI Health Copilot Orchestrator
 * Pipeline: Context → Intent → Questions → Risk → Recommendations → Actions
 */

const { loadHealthContext } = require('./HealthContextLoader');
const llmService = require('./LlmService');

const MEDICAL_DISCLAIMER =
  'These are educational hypotheses only — not a diagnosis. Only a qualified clinician can diagnose and treat you.';

const sessions = new Map();

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function generateGreeting(context) {
  const lines = [`${getTimeGreeting()} ${context.personal.firstName}.`];
  if (context.insights.length) {
    lines.push('', context.insights[0]);
  }
  lines.push('', 'How can I help you today?');
  return lines.join('\n');
}

function detectIntent(message) {
  const m = message.toLowerCase();
  if (/\b(emergency|1122|ambulance|can't breathe|cannot breathe)\b/.test(m)) return 'emergency';
  if (/\b(pain|chest|fever|headache|symptom|hurt|ache)\b/.test(m)) return 'symptoms';
  if (/\b(medicine|medication|missed|refill|reminder)\b/.test(m)) return 'medicine';
  if (/\b(lab report|test result|explain my report|cbc|hba1c)\b/.test(m)) return 'report';
  if (/\b(lab test|book lab|blood test)\b/.test(m)) return 'lab';
  if (/\b(doctor|specialist|cardiolog|consult)\b/.test(m)) return 'doctor';
  if (/\b(appointment|follow.?up)\b/.test(m)) return 'appointment';
  if (/\b(family|mother|father|child)\b/.test(m)) return 'family';
  return 'general';
}

function getQuestions(intent, message, context, answers) {
  if (intent === 'symptoms' && /\bfever\b/i.test(message)) {
    return [
      { id: 'duration', text: 'How long have you had the fever?', options: ['Less than 24 hours', '1–3 days', 'More than 3 days'] },
      { id: 'temperature', text: 'Do you know your temperature?', options: ['Below 38°C', '38–39°C', 'Above 39°C', 'Not measured'] },
    ].filter((q) => !(q.id in answers));
  }

  if (intent === 'symptoms') {
    return [
      { id: 'location', text: 'Where exactly do you feel the pain or discomfort?', options: ['Chest center', 'Left chest', 'Upper abdomen', 'Other'] },
      { id: 'onset', text: 'When did this start?', options: ['Just now', 'Within the last hour', 'Today', 'A few days ago'] },
      { id: 'radiation', text: 'Does the pain spread to your arm, jaw, or neck?', options: ['Yes', 'No', 'Not sure'] },
      { id: 'severity', text: 'How severe is it (1–10)?', options: ['1–3 Mild', '4–6 Moderate', '7–8 Severe', '9–10 Worst ever'] },
      { id: 'breathlessness', text: 'Do you have shortness of breath?', options: ['Yes', 'No'] },
      { id: 'sweating', text: 'Are you sweating unusually?', options: ['Yes', 'No'] },
    ].filter((q) => !(q.id in answers));
  }

  if (intent === 'medicine') {
    return [
      { id: 'which_medicine', text: 'Which medicine do you need help with?' },
      { id: 'missed_when', text: 'When was your last dose?', options: ['On time', 'Missed today', 'Missed yesterday'] },
    ].filter((q) => !(q.id in answers));
  }

  return [];
}

function assessRisk(intent, message, answers, context) {
  const factors = [];
  const reasoning = [];
  let score = 0;
  const lower = message.toLowerCase();
  const isChest = /\bchest\b/i.test(lower) || answers.location?.includes('Chest');

  if (intent === 'emergency') {
    return {
      level: 'critical',
      score: 100,
      factors: ['Emergency request'],
      reasoning: ['Seek emergency care immediately. Call 1122.'],
      differentials: [{ condition: 'Possible acute emergency', confidence: 'high' }],
    };
  }

  if (isChest) {
    score += 30;
    factors.push('Chest pain');
    reasoning.push('Chest pain requires cardiovascular assessment.');
    if (answers.radiation === 'Yes') { score += 20; factors.push('Radiating pain'); }
    if (answers.breathlessness === 'Yes') { score += 20; factors.push('Shortness of breath'); }
    if (answers.severity?.includes('9') || answers.severity?.includes('Worst')) { score += 25; factors.push('Severe pain'); }
    if (context.conditions.some((c) => /diabetes|heart|hypertension/i.test(c))) {
      score += 15;
      factors.push('Cardiovascular risk condition');
      reasoning.push('Diabetes and heart conditions increase risk with chest pain.');
    }
    if (context.personal.age >= 45) { score += 10; factors.push(`Age ${context.personal.age}`); }
    if (context.lifestyle?.smoking) { score += 10; factors.push('Smoking'); }

    const differentials = [
      { condition: 'Muscle strain', confidence: 'low' },
      { condition: 'Acid reflux', confidence: 'medium' },
      { condition: 'Angina', confidence: score >= 40 ? 'medium' : 'low' },
    ];
    if (score >= 50) {
      differentials.push({ condition: 'Heart attack (possible)', confidence: score >= 70 ? 'high' : 'medium', note: 'Emergency evaluation recommended' });
    }

    return { level: scoreToLevel(score), score, factors, reasoning, differentials };
  }

  if (/\bfever\b/i.test(lower)) {
    if (answers.temperature?.includes('Above 39')) { score += 25; factors.push('High fever'); }
    return {
      level: scoreToLevel(score),
      score,
      factors,
      reasoning: score > 25 ? ['Persistent high fever needs medical review.'] : ['Monitor and rest.'],
      differentials: [{ condition: 'Viral infection', confidence: 'medium' }],
    };
  }

  return { level: 'low', score, factors, reasoning: ['No immediate red flags detected.'], differentials: [] };
}

function scoreToLevel(score) {
  if (score >= 70) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function buildObservation(message, answers = {}) {
  const blob = `${message} ${Object.values(answers).join(' ')}`.toLowerCase();
  return {
    fever: /\bfever|temperature|pyrexia|chills?\b/i.test(blob),
    cough: /\bcough|phlegm|sputum\b/i.test(blob),
    cold: /\bcold|runny nose|sneezing|congestion|flu\b/i.test(blob),
    headache: /\bheadache|migraine\b/i.test(blob),
    stomach: /\bstomach|nausea|vomit|diarrhea|diarrhoea|abdomen|gastric\b/i.test(blob),
    pain: /\bpain|ache|sore|hurt\b/i.test(blob),
    fatigue: /\btired|fatigue|weak|exhaust|letharg/i.test(blob),
    chest: /\bchest\b/i.test(blob),
    breathlessness: /\bbreath|breathless|short of breath|wheez/i.test(blob),
    durationLong: /more than 3 days|over a week|weeks/i.test(blob) || answers.duration === 'More than 3 days',
    highTemp: /above 39|39°|high fever/i.test(blob),
  };
}

function generateActions(intent, riskLevel, message, answers = {}) {
  const actions = [];
  const add = (type, label, reason, priority, navigation) => {
    actions.push({ id: createId(), type, label, reason, priority, navigation });
  };
  const obs = buildObservation(message, answers);

  if (riskLevel === 'critical') {
    add('emergency_alert', 'Call emergency (1122)', 'Your symptoms may need immediate care.', 100);
    add('book_doctor', 'Find emergency care', 'Emergency departments evaluate acute symptoms.', 90, { screen: 'ConsultHome' });
    return actions;
  }

  if (intent === 'symptoms') {
    if (obs.chest || obs.breathlessness) {
      if (riskLevel === 'high' || riskLevel === 'medium') {
        add('book_lab', 'Book ECG + basic cardiac labs', 'Chest or breathing symptoms with risk factors need testing.', 88, { screen: 'LabTestsList' });
      }
      add('book_doctor', 'Book Cardiologist', 'Specialist evaluation for chest-related symptoms.', 86, { screen: 'DoctorsList', params: { specialty: 'Cardiology' } });
      add('health_plan', 'Stop activity & rest upright', 'Avoid exertion and seek care if pain worsens.', 55, { screen: 'HealthHome' });
    } else if (obs.fever) {
      add('health_plan', 'Fever rest & hydration plan', 'Rest, sip fluids, and check temperature every 4–6 hours.', 82, { screen: 'HealthHome' });
      add('order_medicine', 'Browse fever-care medicines', 'Pharmacy options for fever comfort — follow label dosing.', 74, { screen: 'MedicinesList' });
      if (!obs.highTemp && riskLevel === 'low') {
        add('health_plan', 'Light recovery movement', 'Skip intense workouts; short walks once fever eases.', 58, { screen: 'HealthHome' });
      }
      if (riskLevel === 'medium' || riskLevel === 'high' || obs.durationLong || obs.highTemp) {
        add('book_doctor', 'Book GP today', 'Persistent or high fever should be reviewed.', 80, { screen: 'DoctorsList', params: { specialty: 'General Physician' } });
        add('book_lab', 'Book CBC / infection labs', 'Blood tests help clarify prolonged fever.', 70, { screen: 'LabTestsList' });
      }
    } else if (obs.cough || obs.cold) {
      add('health_plan', 'Cough & cold recovery plan', 'Warm fluids, steam, and rest. Avoid smoke.', 80, { screen: 'HealthHome' });
      add('order_medicine', 'Browse cough & cold care', 'OTC options — confirm with a pharmacist if unsure.', 72, { screen: 'MedicinesList' });
      add('health_plan', 'Breathing & gentle mobility', 'Slow deep breaths and short walks if comfortable.', 60, { screen: 'HealthHome' });
      if (riskLevel !== 'low' || obs.durationLong) {
        add('book_doctor', 'Book GP / chest review', 'Ongoing cough may need clinical assessment.', 76, { screen: 'DoctorsList', params: { specialty: 'General Physician' } });
      }
    } else if (obs.headache) {
      add('health_plan', 'Headache relief routine', 'Rest in a quiet room, hydrate, limit screens.', 80, { screen: 'HealthHome' });
      add('order_medicine', 'Browse headache relief', 'Pharmacy pain-relief — follow label dosing.', 70, { screen: 'MedicinesList' });
      add('health_plan', 'Neck stretch & posture reset', 'Gentle stretches can ease tension headaches.', 58, { screen: 'HealthHome' });
    } else if (obs.stomach) {
      add('health_plan', 'Stomach-settling care plan', 'ORS/water, bland foods, avoid spicy meals today.', 80, { screen: 'HealthHome' });
      add('order_medicine', 'Browse digestive care', 'ORS and antacids from partner pharmacies.', 72, { screen: 'MedicinesList' });
    } else if (obs.fatigue) {
      add('health_plan', 'Energy & sleep reset plan', 'Consistent sleep, hydration, and daylight walking.', 78, { screen: 'HealthHome' });
      add('health_plan', 'Low-impact exercise starter', 'Light walking or stretching 3–4 days/week.', 65, { screen: 'HealthHome' });
      add('book_doctor', 'Discuss with a doctor', 'Persistent fatigue can need labs and a check.', 60, { screen: 'DoctorsList', params: { specialty: 'General Physician' } });
    } else if (obs.pain) {
      add('health_plan', 'Pain pacing & rest plan', 'Alternate rest with gentle movement.', 78, { screen: 'HealthHome' });
      add('order_medicine', 'Browse pain-care options', 'Pharmacy options — use only as directed.', 70, { screen: 'MedicinesList' });
      add('book_doctor', 'Book a doctor', 'A clinician can assess the cause of your pain.', 75, { screen: 'DoctorsList' });
    } else {
      add('health_plan', 'Rest, fluids & monitor plan', 'Rest, hydrate, and note if symptoms worsen overnight.', 76, { screen: 'HealthHome' });
      add('order_medicine', 'Browse supportive medicines', 'Pharmacy essentials for common symptom care.', 68, { screen: 'MedicinesList' });
      add('health_plan', 'Gentle recovery exercise', 'Short walks and light stretching once stable.', 58, { screen: 'HealthHome' });
      add('book_doctor', 'Book a doctor', 'Get a clinical opinion if symptoms continue.', 52, { screen: 'DoctorsList' });
    }
  }

  if (intent === 'medicine') {
    add('schedule_reminder', 'Set medicine reminder', 'Reminders improve adherence.', 70, { screen: 'MedicinesList' });
    add('order_medicine', 'Order medicines', 'Refill from verified pharmacies.', 65, { screen: 'MedicinesList' });
  }

  if (intent === 'lab' || intent === 'report') {
    add('book_lab', 'Book lab tests', 'Home collection available.', 75, { screen: 'LabTestsList' });
  }

  if (intent === 'doctor' || intent === 'appointment') {
    add('book_doctor', 'See matched doctors', 'Matched by specialty and availability.', 80, { screen: 'DoctorsList' });
  }

  if (intent === 'family') {
    add('family_notification', 'Check family health', 'Review family medicines and labs.', 70, { screen: 'FamilyProfiles' });
  }

  if (!actions.length) {
    add('book_doctor', 'Book a doctor', 'A clinician can help with your concern.', 50, { screen: 'DoctorsList' });
    add('order_medicine', 'Browse medicines', 'Find pharmacy support while you decide next steps.', 45, { screen: 'MedicinesList' });
    add('book_lab', 'Book a lab test', 'Tests clarify many health questions.', 45, { screen: 'LabTestsList' });
  }

  const byLabel = new Map();
  for (const action of actions) {
    const existing = byLabel.get(action.label);
    if (!existing || action.priority > existing.priority) byLabel.set(action.label, action);
  }

  return [...byLabel.values()].sort((a, b) => b.priority - a.priority).slice(0, 4);
}

async function createSession(userId) {
  const context = await loadHealthContext(userId);
  if (!context) throw new Error('User not found');

  const session = {
    sessionId: createId(),
    userId,
    phase: 'intent',
    intent: null,
    answers: {},
    questionIndex: 0,
    pendingQuestions: [],
    riskLevel: null,
    completed: false,
    context,
    messages: [],
  };

  const baseGreeting = generateGreeting(context);
  const greeting = await llmService.enhanceGreeting(context, baseGreeting);
  const greetingMsg = {
    id: createId(),
    role: 'assistant',
    text: greeting,
    timestamp: new Date().toISOString(),
    disclaimer: MEDICAL_DISCLAIMER,
    suggestedReplies: ['I have chest pain', 'I need a doctor', 'Explain my lab report', 'I missed my medicine'],
  };

  session.messages.push(greetingMsg);
  sessions.set(session.sessionId, session);

  return { session: sanitizeSession(session), messages: [greetingMsg] };
}

async function sendMessage(userId, sessionId, text) {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) throw new Error('Session not found');

  const trimmed = text.trim();
  if (!trimmed) return { session: sanitizeSession(session), messages: [] };

  const userMsg = { id: createId(), role: 'user', text: trimmed, timestamp: new Date().toISOString() };
  session.messages.push(userMsg);
  const responses = [];

  if (session.phase === 'questions' && session.pendingQuestions.length) {
    const currentQ = session.pendingQuestions[session.questionIndex];
    if (currentQ) {
      session.answers[currentQ.id] = trimmed;
      session.questionIndex += 1;
    }

    const nextQ = session.pendingQuestions[session.questionIndex];
    if (nextQ) {
      const msg = {
        id: createId(),
        role: 'assistant',
        text: nextQ.text,
        timestamp: new Date().toISOString(),
        intent: session.intent,
        suggestedReplies: nextQ.options,
        disclaimer: MEDICAL_DISCLAIMER,
      };
      session.messages.push(msg);
      responses.push(msg);
      return { session: sanitizeSession(session), messages: [userMsg, ...responses] };
    }

    return await completeAssessment(session, userMsg);
  }

  const intent = detectIntent(trimmed);
  session.intent = intent;
  session.triggerMessage = trimmed;
  session.answers = {};
  session.questionIndex = 0;
  session.phase = 'intent';

  if (intent === 'emergency') {
    session.phase = 'assessment';
    return await completeAssessment(session, userMsg, trimmed);
  }

  const questions = getQuestions(intent, trimmed, session.context, session.answers);
  if (!questions.length) {
    session.phase = 'assessment';
    return await completeAssessment(session, userMsg, trimmed);
  }

  session.phase = 'questions';
  session.pendingQuestions = questions;
  session.questionIndex = 0;

  const intro = intent === 'symptoms'
    ? 'I understand you have symptoms. Let me ask a few quick questions to assess urgency.'
    : `I'll help with your ${intent.replace('_', ' ')} request. A few quick questions first.`;

  const firstQ = questions[0];
  const msg = {
    id: createId(),
    role: 'assistant',
    text: `${intro}\n\n${firstQ.text}`,
    timestamp: new Date().toISOString(),
    intent,
    suggestedReplies: firstQ.options,
    disclaimer: MEDICAL_DISCLAIMER,
  };
  session.messages.push(msg);
  responses.push(msg);

  return { session: sanitizeSession(session), messages: [userMsg, ...responses] };
}

async function completeAssessment(session, userMsg, messageOverride) {
  const message = messageOverride || session.triggerMessage || userMsg.text;
  const assessment = assessRisk(session.intent || 'general', message, session.answers, session.context);
  session.riskLevel = assessment.level;
  session.phase = 'actions';
  session.completed = true;

  const actions = generateActions(session.intent, assessment.level, message, session.answers);
  const lines = [`Risk level: ${assessment.level}`];

  if (assessment.differentials.length) {
    lines.push('', 'Possible causes (not a diagnosis):');
    assessment.differentials.forEach((d) => {
      lines.push(`• ${d.condition} (${d.confidence} confidence)${d.note ? ` — ${d.note}` : ''}`);
    });
  }

  lines.push('', 'Based on your observation, here is what I recommend next:');
  assessment.reasoning.forEach((r) => lines.push(`• ${r}`));
  lines.push('', 'Pick a next step below — rest plan, medicines, exercise guidance, labs, or a doctor.');

  return buildAssessmentResponse(session, userMsg, assessment, actions, lines.join('\n'));
}

async function buildAssessmentResponse(session, userMsg, assessment, actions, defaultText) {
  let text = defaultText;
  let suggestedReplies;

  const llm = await llmService.generateCopilotTurn({
    context: session.context,
    session,
    userMessage: userMsg.text,
    ruleBasedResult: {
      riskLevel: assessment.level,
      differentials: assessment.differentials,
      reasoning: assessment.reasoning,
      actions,
    },
  });

  if (llm?.text) {
    text = llm.text;
    suggestedReplies = llm.suggestedReplies;
  }

  const msg = {
    id: createId(),
    role: 'assistant',
    text,
    timestamp: new Date().toISOString(),
    intent: session.intent,
    riskLevel: assessment.level,
    differentials: assessment.differentials,
    reasoning: llm?.reasoning?.length ? llm.reasoning : assessment.reasoning,
    actions,
    disclaimer: MEDICAL_DISCLAIMER,
    suggestedReplies,
  };

  session.messages.push(msg);
  return { session: sanitizeSession(session), messages: [userMsg, msg] };
}

function sanitizeSession(session) {
  return {
    sessionId: session.sessionId,
    phase: session.phase,
    intent: session.intent,
    riskLevel: session.riskLevel,
    completed: session.completed,
  };
}

function getSession(userId, sessionId) {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) return null;
  return {
    session: sanitizeSession(session),
    messages: session.messages,
    context: {
      personal: session.context.personal,
      insights: session.context.insights,
    },
  };
}

module.exports = {
  createSession,
  sendMessage,
  getSession,
  MEDICAL_DISCLAIMER,
};

const VALID_FREQUENCY = new Set(['morning', 'afternoon', 'night']);
const VALID_PURPOSE_SOURCES = new Set(['prescription', 'inferred', 'unknown']);

function normalizeFrequency(input) {
  if (!input) return [];
  const items = Array.isArray(input) ? input : [input];
  const out = new Set();

  for (const raw of items) {
    const text = String(raw || '').toLowerCase();
    if (text.includes('morning') || text.includes('breakfast') || /\b(1-0-0|1x morning)\b/.test(text)) {
      out.add('morning');
    }
    if (text.includes('afternoon') || text.includes('lunch') || /\b(0-1-0|1x afternoon)\b/.test(text)) {
      out.add('afternoon');
    }
    if (
      text.includes('night') ||
      text.includes('evening') ||
      text.includes('bedtime') ||
      text.includes('dinner') ||
      /\b(0-0-1|1x night|hs|h\.s\.)\b/.test(text)
    ) {
      out.add('night');
    }
    if (/\b(1-1-1|tds|three times|tid)\b/.test(text)) {
      out.add('morning');
      out.add('afternoon');
      out.add('night');
    }
    if (/\b(bd|twice|1-0-1|1-1-0|bid)\b/.test(text)) {
      out.add('morning');
      out.add('night');
    }
    if (/\b(od|once daily|1x daily|qd)\b/.test(text)) {
      out.add('morning');
    }
  }

  return [...out].filter(f => VALID_FREQUENCY.has(f));
}

function normalizePurpose(med = {}, prescriptionDiagnosis = null) {
  const explicit =
    med.purpose ||
    med.indication ||
    med.reason ||
    med.for_condition ||
    med.use ||
    null;

  let purpose = explicit ? String(explicit).trim() : null;
  let purposeSource = med.purpose_source || med.purposeSource || null;

  if (purpose) {
    purposeSource = VALID_PURPOSE_SOURCES.has(purposeSource) ? purposeSource : 'prescription';
  } else if (prescriptionDiagnosis) {
    purpose = String(prescriptionDiagnosis).trim();
    purposeSource = 'inferred';
  } else {
    purposeSource = 'unknown';
  }

  return { purpose: purpose || null, purpose_source: purposeSource };
}

function normalizeMedicine(med = {}, prescriptionDiagnosis = null) {
  const name = String(med.name || med.medicine || med.drug || '').trim();
  if (!name) return null;

  const { purpose, purpose_source } = normalizePurpose(med, prescriptionDiagnosis);

  return {
    name,
    dose: med.dose || med.strength || med.dosage || null,
    frequency: normalizeFrequency(med.frequency || med.timing || med.schedule),
    instructions: med.instructions || med.notes || med.directions || null,
    duration: med.duration || med.days || null,
    purpose,
    purpose_source,
  };
}

function normalizeOcrResult(raw, { provider, source, rawText = null }) {
  const diagnosis =
    raw?.diagnosis || raw?.chief_complaint || raw?.impression || null;

  const medicines = (raw?.medicines || [])
    .map(med => normalizeMedicine(med, diagnosis))
    .filter(Boolean);

  const withPurpose = medicines.filter(m => m.purpose).length;
  const labTests = (raw?.lab_tests || raw?.labTests || raw?.investigations || [])
    .map(item => (typeof item === 'string' ? item : item?.name || item?.test))
    .map(name => String(name || '').trim())
    .filter(Boolean);

  let note = 'No medicines could be read clearly. You can add them manually.';
  if (medicines.length > 0) {
    note = `Extracted ${medicines.length} medicine(s)${withPurpose ? ` with ${withPurpose} purpose(s)` : ''}. Please verify before use.`;
  }
  if (labTests.length > 0) {
    note = `${note} Found ${labTests.length} lab test(s) on the prescription.`;
  }

  return {
    source,
    extracted_at: new Date().toISOString(),
    provider,
    doctor: raw?.doctor || raw?.doctor_name || null,
    clinic: raw?.clinic || raw?.hospital || null,
    prescription_date: raw?.prescription_date || raw?.date || null,
    diagnosis,
    lab_tests: labTests,
    medicines,
    raw_text: rawText || raw?.raw_text || null,
    confidence: raw?.confidence || (medicines.length || labTests.length ? 'medium' : 'low'),
    note,
  };
}

module.exports = {
  normalizeFrequency,
  normalizeMedicine,
  normalizeOcrResult,
};

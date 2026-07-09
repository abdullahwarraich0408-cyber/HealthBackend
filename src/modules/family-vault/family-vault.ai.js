const MS_DAY = 24 * 60 * 60 * 1000;

function daysUntil(date) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / MS_DAY);
}

function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / MS_DAY);
}

function computeHealthScore(member) {
  let score = 85;
  const conditions = member.medical_profile?.conditions?.length || 0;
  score -= conditions * 4;

  const missedMeds = (member.medicines || []).reduce((acc, med) => {
    const log = med.adherence_log || {};
    const missed = Object.values(log).filter((v) => v === 'missed').length;
    return acc + missed;
  }, 0);
  score -= Math.min(missedMeds * 2, 20);

  const overdueVaccines = (member.vaccinations || []).filter(
    (v) => v.next_due && new Date(v.next_due) < new Date(),
  ).length;
  score -= overdueVaccines * 5;

  return Math.max(40, Math.min(100, score));
}

function buildMemberInsights(member) {
  const insights = [];
  const alerts = [];

  for (const med of member.medicines || []) {
    const endDays = daysUntil(med.end_date);
    if (endDays !== null && endDays <= 1 && endDays >= 0) {
      alerts.push({ type: 'medicine_due', severity: 'high', message: `${med.name} runs out ${endDays === 0 ? 'today' : 'tomorrow'}.` });
    }
    const log = med.adherence_log || {};
    const recentMissed = Object.entries(log)
      .filter(([date, status]) => status === 'missed' && daysSince(date) <= 7)
      .length;
    if (recentMissed >= 3) {
      alerts.push({ type: 'missed_medicine', severity: 'high', message: `Missed ${med.name} for ${recentMissed} doses this week.` });
    }
  }

  for (const vax of member.vaccinations || []) {
    const dueDays = daysUntil(vax.next_due);
    if (dueDays !== null && dueDays >= 0 && dueDays <= 14) {
      alerts.push({ type: 'vaccination_due', severity: 'medium', message: `${vax.vaccine_name} due ${dueDays === 0 ? 'today' : `in ${dueDays} day(s)`}.` });
    }
  }

  for (const doc of member.doctors || []) {
    const followUpDays = daysUntil(doc.next_appointment);
    if (followUpDays !== null && followUpDays < 0) {
      alerts.push({ type: 'follow_up_overdue', severity: 'medium', message: `Follow-up with ${doc.name} is overdue.` });
    }
  }

  const labReports = [...(member.lab_reports || [])].sort(
    (a, b) => new Date(b.report_date) - new Date(a.report_date),
  );
  if (labReports.length >= 2) {
    const latest = labReports[0];
    const previous = labReports[1];
    if (latest.category === 'hba1c' && previous.category === 'hba1c') {
      const latestVal = latest.extracted_values?.hba1c;
      const prevVal = previous.extracted_values?.hba1c;
      if (latestVal && prevVal && Number(latestVal) > Number(prevVal)) {
        insights.push({ type: 'lab_trend', message: `HbA1c increased compared to last test (${prevVal} → ${latestVal}). Follow-up recommended.` });
      }
    }
  }

  const bpReadings = (member.vitals || [])
    .filter((v) => v.vital_type === 'blood_pressure')
    .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
  if (bpReadings.length >= 2) {
    insights.push({ type: 'vital_trend', message: 'Blood pressure readings available for trend review.' });
  }

  return { insights, alerts };
}

function buildDashboard(members) {
  return members.map((member) => {
    const score = computeHealthScore(member);
    const { insights, alerts } = buildMemberInsights(member);
    const statusLines = [
      ...alerts.slice(0, 2).map((a) => a.message),
      ...insights.slice(0, 1).map((i) => i.message),
    ];
    return {
      id: member.id,
      full_name: member.full_name,
      relationship: member.relationship,
      health_score: score,
      status_lines: statusLines.length ? statusLines : ['No urgent items'],
      alerts,
      insights,
    };
  });
}

function buildCalendarEvents(members) {
  const events = [];
  for (const member of members) {
    for (const appt of member.appointments || []) {
      events.push({
        id: appt.id,
        member_id: member.id,
        member_name: member.full_name,
        type: 'appointment',
        title: `Appointment: ${appt.doctor_name}`,
        date: appt.appointment_date,
      });
    }
    for (const doc of member.doctors || []) {
      if (doc.next_appointment) {
        events.push({
          id: `doc-${doc.id}`,
          member_id: member.id,
          member_name: member.full_name,
          type: 'follow_up',
          title: `Follow-up: ${doc.name}`,
          date: doc.next_appointment,
        });
      }
    }
    for (const med of member.medicines || []) {
      if (med.end_date) {
        events.push({
          id: `med-${med.id}`,
          member_id: member.id,
          member_name: member.full_name,
          type: 'medicine_refill',
          title: `Refill: ${med.name}`,
          date: med.end_date,
        });
      }
    }
    for (const vax of member.vaccinations || []) {
      if (vax.next_due) {
        events.push({
          id: `vax-${vax.id}`,
          member_id: member.id,
          member_name: member.full_name,
          type: 'vaccination',
          title: `Vaccination: ${vax.vaccine_name}`,
          date: vax.next_due,
        });
      }
    }
  }
  return events.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function buildWeeklySummary(members) {
  const memberSummaries = members.map((member) => {
    const { insights, alerts } = buildMemberInsights(member);
    const bullets = [
      ...alerts.map((a) => a.message),
      ...insights.map((i) => i.message),
    ];
    if (!bullets.length) bullets.push('No significant changes this week. Continue current routine.');
    return {
      id: member.id,
      name: member.full_name,
      relationship: member.relationship,
      bullets: bullets.slice(0, 4),
      health_score: computeHealthScore(member),
    };
  });

  const overallScore = memberSummaries.length
    ? Math.round(memberSummaries.reduce((s, m) => s + m.health_score, 0) / memberSummaries.length)
    : null;

  return {
    generated_at: new Date().toISOString(),
    members: memberSummaries,
    overall_family_health_score: overallScore,
    disclaimer: 'This AI summary is informational only. Medical decisions should always be confirmed with a qualified healthcare professional.',
  };
}

function answerCopilotQuestion(question, members) {
  const q = question.toLowerCase();

  if (q.includes('missed') && q.includes('medicine')) {
    const results = [];
    for (const m of members) {
      for (const med of m.medicines || []) {
        const log = med.adherence_log || {};
        const todayMissed = log[new Date().toISOString().slice(0, 10)] === 'missed';
        if (todayMissed) results.push(`${m.full_name}: missed ${med.name} today`);
      }
    }
    return results.length
      ? { answer: results.join('. '), links: results.map((_, i) => ({ memberId: members[i]?.id })) }
      : { answer: 'No family members missed medicine today based on logged adherence.' };
  }

  if (q.includes('vaccination') && (q.includes('due') || q.includes('month'))) {
    const due = [];
    for (const m of members) {
      for (const v of m.vaccinations || []) {
        const d = daysUntil(v.next_due);
        if (d !== null && d >= 0 && d <= 31) due.push(`${m.full_name}: ${v.vaccine_name} due in ${d} day(s)`);
      }
    }
    return { answer: due.length ? due.join('. ') : 'No vaccinations due this month.' };
  }

  if (q.includes('appointment') && q.includes('week')) {
    const weekEvents = buildCalendarEvents(members).filter((e) => {
      const d = daysUntil(e.date);
      return d !== null && d >= 0 && d <= 7 && e.type === 'appointment';
    });
    return {
      answer: weekEvents.length
        ? weekEvents.map((e) => `${e.member_name}: ${e.title} on ${new Date(e.date).toLocaleDateString()}`).join('. ')
        : 'No appointments scheduled this week.',
    };
  }

  if (q.includes('blood pressure') || q.includes('bp')) {
    for (const m of members) {
      const nameMatch = q.includes(m.full_name.toLowerCase()) || q.includes(m.relationship.toLowerCase());
      if (nameMatch || members.length === 1) {
        const readings = (m.vitals || [])
          .filter((v) => v.vital_type === 'blood_pressure')
          .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at))
          .slice(0, 5);
        if (readings.length) {
          return {
            answer: `${m.full_name}'s recent BP readings: ${readings.map((r) => `${r.value} (${new Date(r.recorded_at).toLocaleDateString()})`).join(', ')}.`,
            memberId: m.id,
          };
        }
      }
    }
  }

  if (q.includes('diabetes')) {
    for (const m of members) {
      const hasDiabetes = m.medical_profile?.conditions?.some((c) => c.name.toLowerCase().includes('diabetes'));
      if (hasDiabetes || q.includes(m.full_name.toLowerCase())) {
        const hba1c = (m.lab_reports || []).filter((r) => r.category === 'hba1c').sort((a, b) => new Date(b.report_date) - new Date(a.report_date));
        const meds = (m.medicines || []).map((med) => med.name).join(', ');
        return {
          answer: `${m.full_name} has diabetes on record. Current medicines: ${meds || 'none logged'}. Latest HbA1c reports: ${hba1c.length ? hba1c[0].extracted_values?.hba1c || 'see lab report' : 'not available'}.`,
          memberId: m.id,
        };
      }
    }
  }

  return {
    answer: 'I can help with family health questions about medicines, appointments, vaccinations, vitals, and conditions. Try asking about a specific family member or topic.',
  };
}

module.exports = {
  computeHealthScore,
  buildMemberInsights,
  buildDashboard,
  buildCalendarEvents,
  buildWeeklySummary,
  answerCopilotQuestion,
};

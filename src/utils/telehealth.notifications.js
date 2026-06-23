const { notificationQueue } = require('../queues');

const queueTelehealthNotification = async (type, recipient, payload = {}) => {
  try {
    await notificationQueue.add(type, {
      channel: payload.channel || 'email',
      recipient,
      type,
      payload,
    });
  } catch {
    // Notifications are best-effort when queue/redis is unavailable.
  }
};

const notifyAppointmentBooked = async ({ doctorEmail, patientEmail, appointment }) => {
  await Promise.all([
    queueTelehealthNotification('appointment-booked-doctor', doctorEmail, {
      channel: 'email',
      appointment,
    }),
    queueTelehealthNotification('appointment-booked-patient', patientEmail, {
      channel: 'email',
      appointment,
    }),
  ]);
};

const notifyAppointmentConfirmed = async ({ doctorEmail, patientEmail, appointment }) => {
  await Promise.all([
    queueTelehealthNotification('appointment-confirmed-doctor', doctorEmail, {
      channel: 'email',
      appointment,
    }),
    queueTelehealthNotification('appointment-confirmed-patient', patientEmail, {
      channel: 'email',
      appointment,
    }),
    queueTelehealthNotification('appointment-confirmed-patient-sms', patientEmail, {
      channel: 'sms',
      appointment,
    }),
  ]);
};

const notifyAppointmentReminder = async ({ patientEmail, appointment, windowLabel }) => {
  await queueTelehealthNotification('appointment-reminder', patientEmail, {
    channel: 'email',
    appointment,
    windowLabel,
  });
};

const notifyAppointmentCompleted = async ({ patientEmail, appointment }) => {
  await queueTelehealthNotification('appointment-completed', patientEmail, {
    channel: 'email',
    appointment,
  });
};

module.exports = {
  notifyAppointmentBooked,
  notifyAppointmentConfirmed,
  notifyAppointmentReminder,
  notifyAppointmentCompleted,
};

const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const { generateMeetingRoom } = require('../../utils/telehealth.utils');
const { createChatForAppointment, createSystemMessage } = require('./telehealth.chat.service');

const appointmentInclude = {
  doctor: {
    select: {
      id: true,
      name: true,
      specialty: true,
      photo_url: true,
      hospital: true,
      fee: true,
    },
  },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  prescription: true,
  review: true,
};

const activateConsultationMode = async (appointmentId, mode, options = {}) => {
  const appointment = await prisma.doctorAppointment.findUnique({
    where: { id: appointmentId },
    include: appointmentInclude,
  });

  if (!appointment) throw new AppError('Appointment not found', 404);

  if (appointment.consultation_mode) {
    if (options.allowExisting) {
      return appointment;
    }
    throw new AppError('Consultation type has already been selected', 400);
  }

  if (!['online', 'in_person'].includes(mode)) {
    throw new AppError('Invalid consultation type', 400);
  }

  if (mode === 'in_person') {
    return prisma.doctorAppointment.update({
      where: { id: appointmentId },
      data: {
        consultation_mode: 'in_person',
        mode_selected_at: new Date(),
      },
      include: appointmentInclude,
    });
  }

  const meeting = generateMeetingRoom(appointment.id);
  const updated = await prisma.doctorAppointment.update({
    where: { id: appointmentId },
    data: {
      consultation_mode: 'online',
      mode_selected_at: new Date(),
      meeting_id: meeting.meeting_id,
      meeting_url: meeting.meeting_url,
    },
    include: appointmentInclude,
  });

  await createChatForAppointment(updated);
  await createSystemMessage(
    appointmentId,
    options.systemMessage ||
      'Online checkup selected. Chat is now open — you can ask questions, share reports, and upload prescriptions before your video visit.'
  );

  return updated;
};

module.exports = {
  activateConsultationMode,
};

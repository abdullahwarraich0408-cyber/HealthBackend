const prisma = require('../../config/database');
const AppError = require('../../utils/AppError');
const {
  getChatWindow,
  canAccessChat,
  canJoinVideo,
  buildVideoRoomPayload,
  isOnlineConsultation,
} = require('../../utils/telehealth.utils');
const { getIO } = require('../../config/socket');

const appointmentInclude = {
  doctor: { select: { id: true, name: true, specialty: true, photo_url: true } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  prescription: true,
  chat: {
    include: {
      messages: {
        orderBy: { created_at: 'asc' },
        take: 200,
      },
    },
  },
};

const formatMessage = (message) => ({
  id: message.id,
  chat_id: message.chat_id,
  sender_id: message.sender_id,
  sender_role: message.sender_role,
  message: message.message,
  message_type: message.message_type,
  attachment_url: message.attachment_url,
  is_read: message.is_read,
  created_at: message.created_at,
});

const assertParticipant = (appointment, user) => {
  const isDoctor = user.role === 'doctor' && user.id === appointment.doctor_id;
  const isCustomer = user.role === 'customer' && user.id === appointment.customer_id;
  if (!isDoctor && !isCustomer) {
    throw new AppError('You do not have access to this appointment', 403);
  }
  return { isDoctor, isCustomer };
};

const createChatForAppointment = async (appointment) => {
  const existing = await prisma.appointmentChat.findUnique({
    where: { appointment_id: appointment.id },
  });
  if (existing) return existing;

  const { opensAt, closesAt } = getChatWindow(appointment);

  return prisma.appointmentChat.create({
    data: {
      appointment_id: appointment.id,
      doctor_id: appointment.doctor_id,
      customer_id: appointment.customer_id,
      opens_at: opensAt,
      closes_at: closesAt,
      is_active: true,
    },
  });
};

const extendChatAfterCompletion = async (appointmentId) => {
  const closesAt = new Date();
  closesAt.setHours(closesAt.getHours() + 72);

  await prisma.appointmentChat.updateMany({
    where: { appointment_id: appointmentId },
    data: {
      closes_at: closesAt,
      is_active: true,
    },
  });
};

const getAppointmentForUser = async (appointmentId, user) => {
  const appointment = await prisma.doctorAppointment.findUnique({
    where: { id: appointmentId },
    include: appointmentInclude,
  });
  if (!appointment) throw new AppError('Appointment not found', 404);
  assertParticipant(appointment, user);
  return appointment;
};

const getChatContext = async (user, appointmentId) => {
  let appointment = await getAppointmentForUser(appointmentId, user);

  if (
    !appointment.chat &&
    isOnlineConsultation(appointment) &&
    ['confirmed', 'in_progress', 'completed'].includes(appointment.status)
  ) {
    await createChatForAppointment(appointment);
    appointment = await getAppointmentForUser(appointmentId, user);
  }

  const chat = appointment.chat;
  const access = canAccessChat(appointment, chat);
  const videoAccess = canJoinVideo(appointment, user.role);
  const videoRoom = appointment.meeting_id
    ? buildVideoRoomPayload(appointment.id, appointment.meeting_id)
    : null;

  return {
    appointment,
    chat,
    access,
    videoAccess,
    videoRoom,
    messages: chat?.messages?.map(formatMessage) || [],
  };
};

const sendMessage = async (user, appointmentId, payload) => {
  const ctx = await getChatContext(user, appointmentId);

  if (!ctx.chat) {
    throw new AppError('Chat is not available for this appointment yet', 400);
  }

  if (!ctx.access.allowed || ctx.access.readOnly) {
    throw new AppError(ctx.access.reason || 'Chat is read-only', 403);
  }

  const hasContent = payload.message?.trim() || payload.attachment_url;
  if (!hasContent) {
    throw new AppError('Message or attachment is required', 400);
  }

  const saved = await prisma.appointmentMessage.create({
    data: {
      chat_id: ctx.chat.id,
      sender_id: user.id,
      sender_role: user.role === 'doctor' ? 'doctor' : 'customer',
      message: payload.message?.trim() || null,
      message_type: payload.message_type || 'text',
      attachment_url: payload.attachment_url || null,
    },
  });

  const formatted = formatMessage(saved);

  try {
    getIO().to(`chat-${appointmentId}`).emit('new-message', {
      appointmentId,
      message: formatted,
    });
  } catch {
    // Socket may not be ready in tests
  }

  return formatted;
};

const markMessagesRead = async (user, appointmentId) => {
  const ctx = await getChatContext(user, appointmentId);
  if (!ctx.chat) return { updated: 0 };

  const result = await prisma.appointmentMessage.updateMany({
    where: {
      chat_id: ctx.chat.id,
      sender_id: { not: user.id },
      is_read: false,
    },
    data: { is_read: true },
  });

  return { updated: result.count };
};

const createSystemMessage = async (appointmentId, text) => {
  const chat = await prisma.appointmentChat.findUnique({ where: { appointment_id: appointmentId } });
  if (!chat) return null;

  const saved = await prisma.appointmentMessage.create({
    data: {
      chat_id: chat.id,
      sender_id: 'system',
      sender_role: 'system',
      message: text,
      message_type: 'system',
    },
  });

  const formatted = formatMessage(saved);

  try {
    getIO().to(`chat-${appointmentId}`).emit('new-message', {
      appointmentId,
      message: formatted,
    });
  } catch {
    // ignore
  }

  return formatted;
};

module.exports = {
  createChatForAppointment,
  extendChatAfterCompletion,
  getChatContext,
  sendMessage,
  markMessagesRead,
  createSystemMessage,
  getAppointmentForUser,
};

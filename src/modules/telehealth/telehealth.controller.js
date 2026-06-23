const catchAsync = require('../../utils/catchAsync');
const { sendResponse } = require('../../utils/response');
const telehealthChatService = require('./telehealth.chat.service');

const getChat = catchAsync(async (req, res) => {
  const context = await telehealthChatService.getChatContext(req.user, req.params.appointmentId);
  sendResponse(
    res,
    200,
    {
      chat: context.chat,
      messages: context.messages,
      access: context.access,
      videoAccess: context.videoAccess,
      videoRoom: context.videoRoom,
      appointment: {
        id: context.appointment.id,
        status: context.appointment.status,
        slot: context.appointment.slot,
        appointment_date: context.appointment.appointment_date,
        doctor: context.appointment.doctor,
        customer: context.appointment.customer,
        meeting_id: context.appointment.meeting_id,
        meeting_url: context.appointment.meeting_url,
      },
    },
    'Appointment chat fetched successfully'
  );
});

const sendMessage = catchAsync(async (req, res) => {
  const message = await telehealthChatService.sendMessage(req.user, req.params.appointmentId, req.body);
  sendResponse(res, 201, { message }, 'Message sent successfully');
});

const markRead = catchAsync(async (req, res) => {
  const result = await telehealthChatService.markMessagesRead(req.user, req.params.appointmentId);
  sendResponse(res, 200, result, 'Messages marked as read');
});

const getVideoAccess = catchAsync(async (req, res) => {
  const context = await telehealthChatService.getChatContext(req.user, req.params.appointmentId);
  sendResponse(
    res,
    200,
    {
      videoAccess: context.videoAccess,
      videoRoom: context.videoRoom,
      appointment: {
        id: context.appointment.id,
        status: context.appointment.status,
        slot: context.appointment.slot,
        appointment_date: context.appointment.appointment_date,
      },
    },
    'Video access fetched successfully'
  );
});

module.exports = {
  getChat,
  sendMessage,
  markRead,
  getVideoAccess,
};

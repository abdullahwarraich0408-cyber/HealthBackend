const { logger } = require('../utils/logger');

const handleTelehealthEvents = (socket, io) => {
  socket.on('join-chat', ({ appointmentId }) => {
    if (!appointmentId) return;
    socket.join(`chat-${appointmentId}`);
    logger.info(`Socket ${socket.id} joined chat-${appointmentId}`);
  });

  socket.on('leave-chat', ({ appointmentId }) => {
    if (!appointmentId) return;
    socket.leave(`chat-${appointmentId}`);
  });

  socket.on('join-consultation', ({ meetingId }) => {
    if (!meetingId) return;
    socket.join(`consultation-${meetingId}`);
    io.to(`consultation-${meetingId}`).emit('participant-joined', {
      meetingId,
      userId: socket.user?.id,
      role: socket.user?.role,
    });
  });
};

module.exports = { handleTelehealthEvents };

module.exports = {
  processPayment: async (amount, orderId) => {
    return { success: true, transactionId: 'EP' + Date.now() };
  }
};

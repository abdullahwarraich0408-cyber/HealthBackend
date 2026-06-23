module.exports = {
  processPayment: async (amount, orderId) => {
    return { success: true, transactionId: 'JC' + Date.now() };
  }
};

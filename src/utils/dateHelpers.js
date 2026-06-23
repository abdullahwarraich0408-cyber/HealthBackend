const { format, addDays, subDays, isAfter } = require('date-fns');

const formatDate = (date, formatString = 'yyyy-MM-dd HH:mm:ss') => {
  return format(new Date(date), formatString);
};

const getPayoutDate = () => {
  // Example: payouts happen next Monday
  return addDays(new Date(), 7); 
};

module.exports = {
  formatDate,
  getPayoutDate,
  addDays,
  subDays,
  isAfter
};

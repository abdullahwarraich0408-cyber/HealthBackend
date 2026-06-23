const PDFDocument = require('pdfkit');

const generateInvoice = (order, res) => {
  const doc = new PDFDocument();

  // Pipe its output to the response
  doc.pipe(res);

  doc.fontSize(25).text('PharmaHub Invoice', { align: 'center' });
  doc.moveDown();

  doc.fontSize(14).text(`Order ID: ${order.id}`);
  doc.text(`Date: ${new Date(order.created_at).toLocaleDateString()}`);
  doc.text(`Total Amount: $${order.total_amount}`);
  
  doc.moveDown();
  doc.text('Thank you for your purchase!');

  doc.end();
};

module.exports = { generateInvoice };

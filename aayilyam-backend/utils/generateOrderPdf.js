const PDFDocument = require('pdfkit');

// Builds a clean, professional one-page order summary PDF and resolves
// with it as a Buffer (ready to attach to an email — no disk writes,
// no logo image required, just a text-based branded header).
function generateOrderPdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const green = '#12301f';
    const gray = '#555555';
    const lightGray = '#999999';

    // ---- Branded header (text-based, no logo file needed) ----
    doc.fontSize(20).font('Helvetica-Bold').fillColor(green)
      .text('Aayilyam Stores', { align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor(gray)
      .text('Velur, Thrissur District, Kerala - 680601  |  +91 97447 56758', { align: 'center' });
    doc.moveDown(0.8);
    doc.strokeColor(green).lineWidth(1.2)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(1);

    doc.fontSize(15).font('Helvetica-Bold').fillColor('#000').text('Order Summary');
    doc.moveDown(0.6);

    // ---- Order / customer details ----
    const orderDate = order.created_at ? new Date(order.created_at) : new Date();
    const formattedDate = orderDate.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const detailRow = (label, value) => {
      doc.fontSize(10.5)
        .font('Helvetica-Bold').fillColor('#000').text(`${label}: `, { continued: true })
        .font('Helvetica').fillColor(gray).text(value || '-');
      doc.moveDown(0.15);
    };

    detailRow('Order ID', order.id);
    detailRow('Order Date & Time', formattedDate);
    detailRow('Customer Name', order.customer_name);
    detailRow('Customer Phone', order.customer_phone);
    detailRow('Customer Email', order.customer_email);
    detailRow('Delivery Address', order.delivery_address || 'Store Pickup');
    detailRow('Payment Method', order.payment_method);
    detailRow('Order Status', order.status || order.payment_status || 'placed');
    if (order.tracking_code) detailRow('Tracking Code', order.tracking_code);
    if (order.notes) detailRow('Additional Notes', order.notes);

    doc.moveDown(0.8);

    // ---- Items table ----
    doc.fontSize(12.5).font('Helvetica-Bold').fillColor('#000').text('Items Ordered');
    doc.moveDown(0.4);

    const left = doc.page.margins.left;
    const colProduct = left;
    const colQty = left + 260;
    const colPrice = left + 320;
    const colLineTotal = left + 410;
    const tableWidth = doc.page.width - doc.page.margins.right - left;

    const drawTableHeader = () => {
      const y = doc.y;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#fff');
      doc.rect(left, y, tableWidth, 20).fill(green);
      doc.fillColor('#fff');
      doc.text('Product', colProduct + 8, y + 5, { width: 240 });
      doc.text('Qty', colQty, y + 5, { width: 50, align: 'right' });
      doc.text('Unit Price', colPrice, y + 5, { width: 80, align: 'right' });
      doc.text('Line Total', colLineTotal, y + 5, { width: 95, align: 'right' });
      doc.y = y + 24;
    };

    drawTableHeader();

    doc.font('Helvetica').fontSize(10).fillColor('#000');
    (order.items || []).forEach((item, idx) => {
      // New page if we're near the bottom.
      if (doc.y > doc.page.height - doc.page.margins.bottom - 60) {
        doc.addPage();
        drawTableHeader();
      }
      const rowY = doc.y;
      if (idx % 2 === 0) {
        doc.rect(left, rowY, tableWidth, 20).fill('#f2f6f3');
        doc.fillColor('#000');
      }
      doc.font('Helvetica').fontSize(10).fillColor('#000');
      doc.text(item.name, colProduct + 8, rowY + 5, { width: 240 });
      doc.text(String(item.qty), colQty, rowY + 5, { width: 50, align: 'right' });
      doc.text(`Rs. ${Number(item.price).toFixed(2)}`, colPrice, rowY + 5, { width: 80, align: 'right' });
      doc.text(`Rs. ${(item.price * item.qty).toFixed(2)}`, colLineTotal, rowY + 5, { width: 95, align: 'right' });
      doc.y = rowY + 20;
    });

    doc.moveDown(0.6);
    doc.strokeColor(green).lineWidth(1)
      .moveTo(left, doc.y).lineTo(left + tableWidth, doc.y).stroke();
    doc.moveDown(0.4);

    doc.fontSize(13).font('Helvetica-Bold').fillColor(green)
      .text(`Total Amount: Rs. ${Number(order.total).toFixed(2)}`, { align: 'right' });

    doc.moveDown(2);
    doc.fontSize(8.5).font('Helvetica-Oblique').fillColor(lightGray)
      .text('This is a system-generated order summary for internal record-keeping.', { align: 'center' });

    doc.end();
  });
}

module.exports = { generateOrderPdf };

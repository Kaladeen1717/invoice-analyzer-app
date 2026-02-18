const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;

async function createTestInvoice() {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = 750;

    // Title
    page.drawText('INVOICE', {
        x: 50,
        y: y,
        size: 24,
        font: boldFont,
        color: rgb(0, 0, 0)
    });

    y -= 50;

    // Invoice details
    page.drawText('Invoice Number: INV-2024-001', { x: 50, y: y, size: 12, font: font });
    y -= 20;
    page.drawText('Date: January 15, 2024', { x: 50, y: y, size: 12, font: font });
    y -= 20;
    page.drawText('Due Date: February 15, 2024', { x: 50, y: y, size: 12, font: font });

    y -= 40;

    // Supplier info
    page.drawText('From:', { x: 50, y: y, size: 12, font: boldFont });
    y -= 20;
    page.drawText('Acme Corporation', { x: 50, y: y, size: 12, font: font });
    y -= 20;
    page.drawText('123 Business St', { x: 50, y: y, size: 12, font: font });
    y -= 20;
    page.drawText('New York, NY 10001', { x: 50, y: y, size: 12, font: font });

    y -= 40;

    // Items
    page.drawText('Items:', { x: 50, y: y, size: 12, font: boldFont });
    y -= 25;
    page.drawText('Description', { x: 50, y: y, size: 11, font: boldFont });
    page.drawText('Quantity', { x: 300, y: y, size: 11, font: boldFont });
    page.drawText('Price', { x: 400, y: y, size: 11, font: boldFont });
    page.drawText('Total', { x: 500, y: y, size: 11, font: boldFont });

    y -= 20;
    page.drawText('Professional Services', { x: 50, y: y, size: 11, font: font });
    page.drawText('10 hrs', { x: 300, y: y, size: 11, font: font });
    page.drawText('$150.00', { x: 400, y: y, size: 11, font: font });
    page.drawText('$1,500.00', { x: 500, y: y, size: 11, font: font });

    y -= 20;
    page.drawText('Consulting', { x: 50, y: y, size: 11, font: font });
    page.drawText('5 hrs', { x: 300, y: y, size: 11, font: font });
    page.drawText('$200.00', { x: 400, y: y, size: 11, font: font });
    page.drawText('$1,000.00', { x: 500, y: y, size: 11, font: font });

    y -= 40;

    // Total
    page.drawText('Subtotal:', { x: 400, y: y, size: 12, font: boldFont });
    page.drawText('$2,500.00', { x: 500, y: y, size: 12, font: font });
    y -= 20;
    page.drawText('Tax (10%):', { x: 400, y: y, size: 12, font: boldFont });
    page.drawText('$250.00', { x: 500, y: y, size: 12, font: font });
    y -= 20;
    page.drawText('TOTAL:', { x: 400, y: y, size: 14, font: boldFont });
    page.drawText('$2,750.00 USD', { x: 480, y: y, size: 14, font: boldFont });

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile('test-invoices/input/test-invoice.pdf', pdfBytes);
    console.log('Test invoice created: test-invoices/input/test-invoice.pdf');
}

createTestInvoice().catch(console.error);

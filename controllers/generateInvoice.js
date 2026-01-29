import PDFDocument from "pdfkit";
import Order from "../models/order.js";
import QRCode from "qrcode";
import path from "path";

const IS_GST_REGISTERED = false;
const SELLER_STATE = "Bihar";
const GST_RATE = 0.05;
const BRAND_COLOR = "#F97316";

const amountInWords = (num) => {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six",
    "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  if (num === 0) return "Zero Rupees";

  const toWords = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + " " + a[n % 10];
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred " + toWords(n % 100);
    if (n < 100000) return toWords(Math.floor(n / 1000)) + " Thousand " + toWords(n % 1000);
    return toWords(Math.floor(n / 100000)) + " Lakh " + toWords(n % 100000);
  };

  return `${toWords(num)} Rupees Only`;
};

export const generateInvoice = async (req, res) => {
  let doc;

  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate("items.product");

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=invoice-${order._id}.pdf`);

    doc = new PDFDocument({ size: "A4", margin: 36 });
    doc.pipe(res);

    /* ================= HEADER ================= */
    doc.rect(0, 0, doc.page.width, 70).fill(BRAND_COLOR);

    const logoPath = path.resolve("./uploads/logo.png");
    doc.image(logoPath, 36, 15, { width: 48 });

    doc.fillColor("#FFFFFF")
      .font("Helvetica-Bold").fontSize(18)
      .text("SWADBEST", 100, 22);

    doc.font("Helvetica").fontSize(9)
      .text("Pure Indian Food", 100, 44)
      .text("Patna, Bihar – 800001", 100, 56);

    doc.fillColor("#000000");

    /* ================= TITLE ================= */
    doc.moveDown(1.8);
    doc.font("Helvetica-Bold").fontSize(11)
      .text(IS_GST_REGISTERED ? "TAX INVOICE" : "BILL OF SUPPLY", { align: "right" });

    if (!IS_GST_REGISTERED) {
      doc.fontSize(8).fillColor("#6B7280")
        .text("(Issued by Non-GST Registered Seller)", { align: "right" })
        .fillColor("#000000");
    }

    /* ================= META ================= */
    doc.fontSize(9);
    doc.text(`Invoice No: INV-${order._id.toString().slice(-6)}`, { align: "right" });
    doc.text(`Order ID: ${order._id}`, { align: "right" });
    doc.text(`Date: ${new Date(order.createdAt).toDateString()}`, { align: "right" });

    /* ================= BILL TO ================= */
    doc.moveDown(1.2);
    doc.font("Helvetica-Bold").text("BILL TO");
    doc.moveDown(0.3);

    doc.font("Helvetica").fontSize(9);
    doc.text(order.address.name);
    doc.text(order.address.line1);
    doc.text(`${order.address.city}, ${order.address.state} – ${order.address.pincode}`);
    doc.text(`Phone: ${order.address.phone}`);

    /* ================= ITEMS TABLE ================= */
    doc.moveDown(1.4);
    const tableTop = doc.y;

    doc.font("Helvetica-Bold").fontSize(9);
    doc.text("Item", 36, tableTop);
    doc.text("Qty", 290, tableTop, { width: 40, align: "right" });
    doc.text("Price", 350, tableTop, { width: 70, align: "right" });
    doc.text("Amount", 450, tableTop, { width: 80, align: "right" });

    doc.moveTo(36, tableTop + 12).lineTo(560, tableTop + 12).stroke();

    let y = tableTop + 18;
    let subtotal = 0;

    doc.font("Helvetica").fontSize(9);

    order.items.forEach((item, i) => {
      const total = item.quantity * item.priceAtPurchase;
      subtotal += total;

      if (i % 2 === 0) {
        doc.rect(36, y - 2, 524, 16).fill("#F9FAFB");
        doc.fillColor("#000000");
      }

      doc.text(item.product.name, 36, y);
      doc.text(item.quantity, 290, y, { width: 40, align: "right" });
      doc.text(`₹${item.priceAtPurchase}`, 350, y, { width: 70, align: "right" });
      doc.text(`₹${total}`, 450, y, { width: 80, align: "right" });

      y += 16;
    });

    /* ================= TOTALS (FIXED ALIGNMENT) ================= */
    const grandTotal = subtotal;
    const summaryTop = y + 14;

    doc.rect(330, summaryTop, 230, 52).stroke("#E5E7EB");

    const drawRow = (label, value, row, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      doc.text(label, 340, summaryTop + 8 + row * 16, { width: 120 });
      doc.text(`₹${value}`, 550, summaryTop + 8 + row * 16, { width: 60, align: "right" });
    };

    drawRow("Subtotal", subtotal, 0);
    drawRow("Tax", "0.00", 1);
    drawRow("Grand Total", grandTotal, 2, true);

    /* ================= AMOUNT IN WORDS ================= */
    doc.moveDown(2.6);
    doc.fontSize(9).font("Helvetica-Bold").text("Amount in Words:");
    doc.font("Helvetica").text(amountInWords(grandTotal));

    /* ================= QR ================= */
    const qrData = `Order:${order._id}\nAmount:${grandTotal}\nPayment:${order.paymentMethod}`;
    const qrImage = await QRCode.toDataURL(qrData);

    doc.image(qrImage, 36, summaryTop, { width: 70 });
    doc.fontSize(8).fillColor("#374151")
      .text("Scan to verify order", 36, summaryTop + 76);

    /* ================= FOOTER ================= */
    doc.fontSize(8).fillColor("#6B7280");
    doc.text(
      "This is a computer generated bill of supply and does not require a signature.",
      36,
      770,
      { align: "center" }
    );
    doc.text("support@swadbest.com", { align: "center" });

    doc.end();
  } catch (err) {
    console.error("Invoice error:", err);
    if (doc && !doc.destroyed) doc.end();
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Invoice generation failed" });
    }
  }
};

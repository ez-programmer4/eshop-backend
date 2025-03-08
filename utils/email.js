const nodemailer = require("nodemailer");

// Configure the email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address from .env
    pass: process.env.EMAIL_PASS, // Your Gmail App Password from .env
  },
});

// Function to send styled order confirmation email
const sendOrderConfirmation = async (email, order) => {
  const itemsList = order.items
    .map(
      (item) => `
    <li style="margin-bottom: 10px;">
      ${item.productId.name} x ${item.quantity} - $${(
        item.quantity * item.productId.price
      ).toFixed(2)}
    </li>
  `
    )
    .join("");

  const htmlContent = `
    <html>
      <body style="font-family: Arial, sans-serif; color: #111; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f7f7f7;">
        <div style="background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); padding: 20px;">
          <!-- Logo -->
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="https://ethioshop-820b.onrender.com/logo.png" alt="EthioShop Logo" style="width: 100px; height: auto;" />
          </div>
          <h1 style="color: #f0c14b; font-size: 24px; margin-bottom: 10px; text-align: center;">Order Confirmed!</h1>
          <p style="font-size: 16px; color: #555; margin-bottom: 20px; text-align: center;">
            Thank you for your order, ${email.split("@")[0]}! Your order #${
    order._id
  } has been placed successfully.
          </p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <p style="font-size: 14px; margin: 5px 0;"><strong>PNR Code:</strong> ${
              order.pnr || "N/A"
            }</p>
            <p style="font-size: 14px; margin: 5px 0;"><strong>Total:</strong> $${order.total.toFixed(
              2
            )}</p>
            <p style="font-size: 14px; margin: 5px 0;"><strong>Payment Method:</strong> ${
              order.paymentMethod.type
            }</p>
            ${
              order.paymentMethod.phone
                ? `<p style="font-size: 14px; margin: 5px 0;"><strong>Phone:</strong> ${order.paymentMethod.phone}</p>`
                : ""
            }
            ${
              order.paymentMethod.last4
                ? `<p style="font-size: 14px; margin: 5px 0;"><strong>Card Ending:</strong> ${order.paymentMethod.last4}</p>`
                : ""
            }
            <p style="font-size: 14px; margin: 5px 0;"><strong>Items:</strong></p>
            <ul style="list-style: none; padding: 0;">${itemsList}</ul>
          </div>
          <div style="margin-bottom: 20px;">
            <h3 style="color: #555; font-size: 18px; margin-bottom: 10px;">Shipping Address</h3>
            <p style="font-size: 14px; color: #555; margin: 5px 0;">
              ${order.shippingAddress.street}, ${order.shippingAddress.city}, 
              ${order.shippingAddress.state} ${
    order.shippingAddress.postalCode
  }, 
              ${order.shippingAddress.country}
            </p>
            <h3 style="color: #555; font-size: 18px; margin-bottom: 10px;">Billing Address</h3>
            <p style="font-size: 14px; color: #555; margin: 5px 0;">
              ${order.billingAddress.street}, ${order.billingAddress.city}, 
              ${order.billingAddress.state} ${order.billingAddress.postalCode}, 
              ${order.billingAddress.country}
            </p>
          </div>
          <p style="font-size: 14px; color: #555; margin-bottom: 20px; text-align: center;">
            We’ll notify you when your order ships. Thank you for shopping with us!
          </p>
          <div style="text-align: center; font-size: 12px; color: #999; padding-top: 10px; border-top: 1px solid #eee;">
            © ${new Date().getFullYear()} EthioShop. All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Order Confirmation #${order._id}`,
    text: `Thank you for your order! Order #${
      order._id
    } has been placed successfully.\nTotal: $${order.total.toFixed(
      2
    )}\nItems: ${order.items.map((item) => item.productId.name).join(", ")}`,
    html: htmlContent,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Order confirmation email sent to ${email}`);
  } catch (error) {
    console.error("Error sending order confirmation email:", error);
    throw error; // Rethrow to handle in caller if needed
  }
};

module.exports = { sendOrderConfirmation };

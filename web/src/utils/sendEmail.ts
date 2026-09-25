import sgMail from "@sendgrid/mail";

interface SendEmailOptions {
  email: string;
  templateId: string;
  data?: Record<string, any>; // dynamic template data
}

const sendEmail = async (options: SendEmailOptions): Promise<void> => {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("Email service is not configured");
  sgMail.setApiKey(apiKey);
  const msg = {
    to: options.email,
    from: process.env.SENDGRID_MAIL as string,
    templateId: options.templateId,
    dynamic_template_data: options.data,
  };

  try {
    await sgMail.send(msg);
    console.log("Email Sent");
  } catch (error: any) {
    console.error("SendGrid Error:", error.message || error);
    throw new Error(error.message || "Email could not be sent");
  }
};

export default sendEmail;

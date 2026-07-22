import nodemailer from "nodemailer";

function smtpConfigured() { return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM); }

export async function sendMail({ to, subject, text, html }) {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP 未配置");
    console.log(JSON.stringify({ level: "info", event: "mail_preview", to, subject }));
    return { preview: true };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || "true") === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined
  });
  return transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, text, html });
}

export function mailStatus() { return { configured: smtpConfigured() }; }

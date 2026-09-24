// Server-only. The actual SMTP send, isolated behind one function so the
// route handler never has to know about nodemailer's own API shape.
import nodemailer from "nodemailer";
import type { SmtpCredentials } from "./email-data.server";

export async function sendSmtpEmail(
  creds: SmtpCredentials,
  input: { to: string; subject: string; body: string },
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.port === 465,
    auth: { user: creds.username, pass: creds.password },
  });
  await transporter.sendMail({
    from: creds.fromName ? `"${creds.fromName}" <${creds.fromEmail}>` : creds.fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.body,
  });
}

import nodemailer from 'nodemailer';
import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Helper to generate clean, human parent-facing HTML emails
function wrapHtmlTemplate(title: string, bodyHtml: string, actionButton?: { label: string; url: string }): string {
  const buttonHtml = actionButton ? `
    <div style="margin: 28px 0;">
      <a href="${actionButton.url}" style="background-color: #B4975A; color: #FFFFFF; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-size: 15px;">
        ${actionButton.label}
      </a>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F4F4F5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #27272A; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F4F4F5; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="540" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #FFFFFF; border: 1px solid #E4E4E7; border-radius: 8px; overflow: hidden;">
          <!-- Top Accent Bar -->
          <tr>
            <td style="background-color: #B4975A; height: 4px; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px 16px 32px; border-bottom: 1px solid #F4F4F5;">
              <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #18181B; letter-spacing: -0.01em;">
                Koinonia Children and Teens
              </h1>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 28px 32px; font-size: 15px; line-height: 1.6; color: #27272A;">
              ${bodyHtml}
              ${buttonHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #FAFAFA; border-top: 1px solid #E4E4E7; font-size: 12px; color: #71717A; text-align: center;">
              Koinonia Children and Teens &bull; Parent Access
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Reusable backend email service supporting Resend API (default/primary) or legacy fallback providers.
 * Never expose or log RESEND_API_KEY or other email credentials.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  try {
    const provider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
    const fromName = process.env.MAIL_FROM_NAME || 'Koinonia Children and Teens';
    const fromAddress = process.env.MAIL_FROM_ADDRESS;
    
    if (!fromAddress) {
      console.error('[EmailService] MAIL_FROM_ADDRESS is not configured in environment.');
      return {
        success: false,
        error: 'We could not send the email right now. Please try again.'
      };
    }

    const fullFrom = `"${fromName}" <${fromAddress}>`;

    // Primary Provider: Resend
    if (provider === 'resend') {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        console.warn(`[EmailService] Notice: RESEND_API_KEY not configured on server. Email to "${options.to}" with subject "${options.subject}" was simulated.`);
        return {
          success: false,
          error: 'We could not send the email right now. Please try again.'
        };
      }

      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: fullFrom,
        to: options.to,
        subject: options.subject,
        html: options.html || options.text || options.subject,
        text: options.text || options.subject
      });

      if (error) {
        console.error(`Resend send failed { error: "${error.message || 'Unknown Resend API error'}" }`);
        return {
          success: false,
          error: 'We could not send the email right now. Please try again.'
        };
      }

      if (options.subject.toLowerCase().includes('verify')) {
        console.log(`Resend verification email sent { emailId: "${data?.id}", to: "${options.to}" }`);
      } else {
        console.log(`Resend email sent { emailId: "${data?.id}", to: "${options.to}" }`);
      }

      return {
        success: true,
        messageId: data?.id
      };
    }

    // Legacy Fallback Provider: SMTP (Nodemailer)
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_SECURE === 'true';
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass || !host) {
      console.warn(`[EmailService] Notice: Email credentials not configured on server. Email to "${options.to}" with subject "${options.subject}" was simulated.`);
      return {
        success: false,
        error: 'We could not send the email right now. Please try again.'
      };
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });

    const info = await transporter.sendMail({
      from: fullFrom,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.subject
    });

    return {
      success: true,
      messageId: info.messageId
    };
  } catch (err: any) {
    // Log safe backend error without exposing sensitive credentials or RESEND_API_KEY
    console.error('[EmailService] Safe Communication Error sending email to', options.to, '-', err?.message || 'Unknown communication error');
    return {
      success: false,
      error: 'We could not send the email right now. Please try again.'
    };
  }
}

/**
 * 1. Email verification
 */
export async function sendEmailVerificationEmail(parentEmail: string, verificationLink: string, fullName?: string): Promise<SendEmailResult> {
  const subject = 'Verify your email for Koinonia Children and Teens';
  
  const cleanName = fullName?.trim() || '';
  const firstName = cleanName.split(/\s+/)[0];
  const greeting = firstName ? `Hello ${firstName},` : 'Hello,';
  
  const bodyHtml = `
    <p style="margin-top: 0;">${greeting}</p>
    <p>Welcome to Koinonia Children and Teens. Please verify your email address to continue setting up your Parent Access.</p>
    <p>Click the button below to verify your email:</p>
  `;
  
  const text = `${greeting}\n\nWelcome to Koinonia Children and Teens. Please verify your email address to continue setting up your Parent Access.\n\nVerify your email here: ${verificationLink}\n\nThank you,\nKoinonia Children and Teens`;

  const html = wrapHtmlTemplate(subject, bodyHtml, { label: 'Verify Email Address', url: verificationLink });

  return sendEmail({ to: parentEmail, subject, html, text });
}

/**
 * 2. Password reset
 */
export async function sendPasswordResetEmail(parentEmail: string, resetLink: string): Promise<SendEmailResult> {
  const subject = 'Reset your password for Parent Access';
  
  const bodyHtml = `
    <p style="margin-top: 0;">Hello,</p>
    <p>We received a request to reset your password for Parent Access.</p>
    <p>Click the button below to choose a new password. If you did not request this, you can safely ignore this email.</p>
  `;
  
  const text = `Hello,\n\nWe received a request to reset your password for Parent Access.\n\nReset your password here: ${resetLink}\n\nIf you did not request this, you can safely ignore this email.\n\nThank you,\nKoinonia Children and Teens`;

  const html = wrapHtmlTemplate(subject, bodyHtml, { label: 'Reset Password', url: resetLink });

  return sendEmail({ to: parentEmail, subject, html, text });
}

/**
 * 3. Details sent for review
 */
export async function sendChildReviewReceivedEmail(parentEmail: string, childName: string): Promise<SendEmailResult> {
  const cleanName = childName?.trim() || 'your child';
  const subject = `Details sent for ${cleanName} – Koinonia Children and Teens`;
  
  const bodyHtml = `
    <p style="margin-top: 0;">Hello,</p>
    <p>Thank you for taking the time to Add a child to Koinonia Children and Teens. We have safely received the details for <strong>${cleanName}</strong>.</p>
    <p>The information is currently Under review by our team to ensure everything is prepared for a safe experience. We will send you another update as soon as the review is complete.</p>
    <p style="margin-bottom: 0;">Warm regards,<br>Koinonia Children and Teens Team</p>
  `;
  
  const text = `Hello,\n\nThank you for taking the time to Add a child to Koinonia Children and Teens. We have safely received the details for ${cleanName}.\n\nThe information is currently Under review by our team to ensure everything is prepared for a safe experience. We will send you another update as soon as the review is complete.\n\nWarm regards,\nKoinonia Children and Teens Team`;

  const html = wrapHtmlTemplate(subject, bodyHtml);

  return sendEmail({ to: parentEmail, subject, html, text });
}

/**
 * 4. Review decision later (Prepared function only, not triggered yet)
 */
export async function sendChildReviewDecisionEmail(parentEmail: string, childName: string, status: string): Promise<SendEmailResult> {
  const cleanName = childName?.trim() || 'your child';
  const isApproved = status === 'approved' || status === 'active';
  const statusLabel = isApproved ? 'Approved' : 'Needs attention';
  const subject = `Update on child details for ${cleanName}`;
  
  const bodyHtml = `
    <p style="margin-top: 0;">Hello,</p>
    <p>We have reviewed the details submitted for <strong>${cleanName}</strong>.</p>
    <p>Current status: <strong>${statusLabel}</strong></p>
    <p>You can sign in to your Parent Access to view full details or check any notes from our team.</p>
    <p style="margin-bottom: 0;">Warm regards,<br>Koinonia Children and Teens Team</p>
  `;
  
  const text = `Hello,\n\nWe have reviewed the details submitted for ${cleanName}.\n\nCurrent status: ${statusLabel}\n\nYou can sign in to your Parent Access to view full details or check any notes from our team.\n\nWarm regards,\nKoinonia Children and Teens Team`;

  const html = wrapHtmlTemplate(subject, bodyHtml);

  return sendEmail({ to: parentEmail, subject, html, text });
}

/**
 * 5. Pass ready later (Prepared function only, not triggered yet)
 */
export async function sendPassReadyEmail(parentEmail: string, childName: string): Promise<SendEmailResult> {
  const cleanName = childName?.trim() || 'your child';
  const subject = `Pass ready for ${cleanName} – Koinonia Children and Teens`;
  
  const bodyHtml = `
    <p style="margin-top: 0;">Hello,</p>
    <p>Great news! The check-in pass is now ready for <strong>${cleanName}</strong>.</p>
    <p>You can view and present the pass directly from your Parent Access when you arrive.</p>
    <p style="margin-bottom: 0;">We look forward to welcoming your family.<br><br>Warm regards,<br>Koinonia Children and Teens Team</p>
  `;
  
  const text = `Hello,\n\nGreat news! The check-in pass is now ready for ${cleanName}.\n\nYou can view and present the pass directly from your Parent Access when you arrive.\n\nWe look forward to welcoming your family.\n\nWarm regards,\nKoinonia Children and Teens Team`;

  const html = wrapHtmlTemplate(subject, bodyHtml);

  return sendEmail({ to: parentEmail, subject, html, text });
}

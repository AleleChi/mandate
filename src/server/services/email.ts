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
      <a href="${actionButton.url}" style="background-color: #C59B27; color: #18181B; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; display: inline-block; font-size: 15px;">
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
<body style="margin: 0; padding: 0; background-color: #FAF8F4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #18181B; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #FAF8F4; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="540" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #FFFFFF; border: 1px solid #EAE8E1; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <!-- Top Accent Bar (Thin Antique Gold) -->
          <tr>
            <td style="background-color: #C59B27; height: 3px; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px 16px 32px; border-bottom: 1px solid #FAF8F4;">
              <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #18181B; letter-spacing: -0.01em;">
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
            <td style="padding: 20px 32px; background-color: #FAFAFA; border-top: 1px solid #EAE8E1; font-size: 12px; color: #71717A; text-align: center;">
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
 * Helper to derive first name from full name safely.
 */
function getFirstName(fullName?: string): string {
  if (!fullName) return '';
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}

/**
 * 1. Email verification
 */
export async function sendEmailVerificationEmail(params: {
  parentEmail: string;
  parentFirstName?: string;
  verificationLink: string;
}): Promise<SendEmailResult> {
  const subject = 'Confirm your email for Parent Access';
  const firstName = getFirstName(params.parentFirstName);
  const greeting = firstName ? `Hello ${firstName},` : 'Hello,';
  
  const bodyHtml = `
    <p style="margin-top: 0;">${greeting}</p>
    <p>Welcome to Koinonia Children and Teens.</p>
    <p>Please confirm this email address so you can continue setting up your Parent Access.</p>
    <p style="margin-top: 24px; color: #71717A; font-size: 13px;">If you did not create this account, you can ignore this email.</p>
  `;
  
  const text = `${greeting}\n\nWelcome to Koinonia Children and Teens.\n\nPlease confirm this email address so you can continue setting up your Parent Access:\n${params.verificationLink}\n\nIf you did not create this account, you can ignore this email.\n\nKoinonia Children and Teens • Parent Access`;

  const html = wrapHtmlTemplate(subject, bodyHtml, { label: 'Confirm email', url: params.verificationLink });

  return sendEmail({ to: params.parentEmail, subject, html, text });
}

/**
 * 2. Password reset
 */
export async function sendPasswordResetEmail(params: {
  parentEmail: string;
  parentFirstName?: string;
  resetLink: string;
}): Promise<SendEmailResult> {
  const subject = 'Reset your Parent Access password';
  const firstName = getFirstName(params.parentFirstName);
  const greeting = firstName ? `Hello ${firstName},` : 'Hello,';
  
  const bodyHtml = `
    <p style="margin-top: 0;">${greeting}</p>
    <p>We received a request to reset your password.</p>
    <p>Use the button below to choose a new password. This link will expire soon for your protection.</p>
    <p style="margin-top: 24px; color: #71717A; font-size: 13px;">If you did not ask for this, you can ignore this email.</p>
  `;
  
  const text = `${greeting}\n\nWe received a request to reset your password.\n\nUse the link below to choose a new password. This link will expire soon for your protection:\n${params.resetLink}\n\nIf you did not ask for this, you can ignore this email.\n\nKoinonia Children and Teens • Parent Access`;

  const html = wrapHtmlTemplate(subject, bodyHtml, { label: 'Reset password', url: params.resetLink });

  return sendEmail({ to: params.parentEmail, subject, html, text });
}

/**
 * 3. Details sent for review
 */
export async function sendChildReviewReceivedEmail(params: {
  parentEmail: string;
  parentFirstName?: string;
  childName: string;
  childStatusLink: string;
}): Promise<SendEmailResult> {
  const childName = params.childName || 'your child';
  const suffix = childName.endsWith('s') ? '’' : '’s';
  const subject = `${childName}${suffix} details have been sent for review`;
  const firstName = getFirstName(params.parentFirstName);
  const greeting = firstName ? `Hello ${firstName},` : 'Hello,';
  
  const bodyHtml = `
    <p style="margin-top: 0;">${greeting}</p>
    <p>We have received ${childName}’s details.</p>
    <p>Our Children and Teens team will review the information you shared and update you when a decision has been made.</p>
    <p>You can also check the child’s status from Parent Access at any time.</p>
    <br>
    <p style="margin-bottom: 0;">Thank you,<br>Koinonia Children and Teens</p>
  `;
  
  const text = `${greeting}\n\nWe have received ${childName}’s details.\n\nOur Children and Teens team will review the information you shared and update you when a decision has been made.\n\nYou can also check the child’s status from Parent Access at any time:\n${params.childStatusLink}\n\nThank you,\nKoinonia Children and Teens`;

  const html = wrapHtmlTemplate(subject, bodyHtml, { label: 'View status', url: params.childStatusLink });

  return sendEmail({ to: params.parentEmail, subject, html, text });
}

/**
 * 4. Review decision (Selected, Not Selected, Needs Info)
 */
export async function sendChildReviewDecisionEmail(params: {
  parentEmail: string;
  parentFirstName?: string;
  childName: string;
  status: string;
  statusLink?: string;
  passLink?: string;
}): Promise<SendEmailResult> {
  const childName = params.childName || 'your child';
  const suffix = childName.endsWith('s') ? '’' : '’s';
  const firstName = getFirstName(params.parentFirstName);
  const greeting = firstName ? `Hello ${firstName},` : 'Hello,';
  const statusLower = params.status.toLowerCase();

  let subject = '';
  let bodyHtml = '';
  let text = '';
  let actionButton: { label: string; url: string } | undefined;

  const resolvedStatusLink = params.statusLink || `${process.env.APP_BASE_URL || 'https://koinonia12.netlify.app'}/#/parent/children`;
  const resolvedPassLink = params.passLink || resolvedStatusLink;

  if (statusLower === 'selected' || statusLower === 'pass_ready' || statusLower === 'approved' || statusLower === 'active') {
    subject = `${childName}${suffix} event pass is ready`;
    bodyHtml = `
      <p style="margin-top: 0;">${greeting}</p>
      <p>${childName} has been selected for Children and Teens at The General Assembly.</p>
      <p>The event pass is now ready in Parent Access.</p>
      <p>Please keep the pass available on event day. Our team will check the child photo and pickup details before entry and pickup.</p>
      <br>
      <p style="margin-bottom: 0;">Thank you,<br>Koinonia Children and Teens</p>
    `;
    text = `${greeting}\n\n${childName} has been selected for Children and Teens at The General Assembly.\n\nThe event pass is now ready in Parent Access.\n\nPlease keep the pass available on event day. Our team will check the child photo and pickup details before entry and pickup.\n\nView pass here:\n${resolvedPassLink}\n\nThank you,\nKoinonia Children and Teens`;
    actionButton = { label: 'View pass', url: resolvedPassLink };
  } else if (statusLower === 'not_selected' || statusLower === 'rejected') {
    subject = `Update on ${childName}${suffix} Children and Teens details`;
    bodyHtml = `
      <p style="margin-top: 0;">${greeting}</p>
      <p>Thank you for sending ${childName}’s details.</p>
      <p>After review, ${childName} was not selected for Children and Teens for this event.</p>
      <p>We understand this may be disappointing. Thank you for your understanding.</p>
      <br>
      <p style="margin-bottom: 0;">Thank you,<br>Koinonia Children and Teens</p>
    `;
    text = `${greeting}\n\nThank you for sending ${childName}’s details.\n\nAfter review, ${childName} was not selected for Children and Teens for this event.\n\nWe understand this may be disappointing. Thank you for your understanding.\n\nView status here:\n${resolvedStatusLink}\n\nThank you,\nKoinonia Children and Teens`;
    actionButton = { label: 'View status', url: resolvedStatusLink };
  } else {
    subject = `More details needed for ${childName}`;
    bodyHtml = `
      <p style="margin-top: 0;">${greeting}</p>
      <p>Our team needs a little more information before we can complete ${childName}’s review.</p>
      <p>Please open Parent Access and update the requested details.</p>
      <br>
      <p style="margin-bottom: 0;">Thank you,<br>Koinonia Children and Teens</p>
    `;
    text = `${greeting}\n\nOur team needs a little more information before we can complete ${childName}’s review.\n\nPlease open Parent Access and update the requested details:\n${resolvedStatusLink}\n\nThank you,\nKoinonia Children and Teens`;
    actionButton = { label: 'Update details', url: resolvedStatusLink };
  }

  const html = wrapHtmlTemplate(subject, bodyHtml, actionButton);
  return sendEmail({ to: params.parentEmail, subject, html, text });
}

/**
 * 5. Pass ready later
 */
export async function sendPassReadyEmail(params: {
  parentEmail: string;
  parentFirstName?: string;
  childName: string;
  passLink: string;
}): Promise<SendEmailResult> {
  const childName = params.childName || 'your child';
  const suffix = childName.endsWith('s') ? '’' : '’s';
  const subject = `${childName}${suffix} event pass is ready`;
  const firstName = getFirstName(params.parentFirstName);
  const greeting = firstName ? `Hello ${firstName},` : 'Hello,';
  
  const bodyHtml = `
    <p style="margin-top: 0;">${greeting}</p>
    <p>${childName} has been selected for Children and Teens at The General Assembly.</p>
    <p>The event pass is now ready in Parent Access.</p>
    <p>Please keep the pass available on event day. Our team will check the child photo and pickup details before entry and pickup.</p>
    <br>
    <p style="margin-bottom: 0;">Thank you,<br>Koinonia Children and Teens</p>
  `;
  
  const text = `${greeting}\n\n${childName} has been selected for Children and Teens at The General Assembly.\n\nThe event pass is now ready in Parent Access.\n\nPlease keep the pass available on event day. Our team will check the child photo and pickup details before entry and pickup.\n\nView pass here:\n${params.passLink}\n\nThank you,\nKoinonia Children and Teens`;

  const html = wrapHtmlTemplate(subject, bodyHtml, { label: 'View pass', url: params.passLink });

  return sendEmail({ to: params.parentEmail, subject, html, text });
}

/**
 * 6. Pickup or event day reminder
 */
export async function sendPickupReminderEmail(params: {
  parentEmail: string;
  parentFirstName?: string;
  childName: string;
  passLink: string;
}): Promise<SendEmailResult> {
  const childName = params.childName || 'your child';
  const suffix = childName.endsWith('s') ? '’' : '’s';
  const subject = `${childName}${suffix} pass and pickup details`;
  const firstName = getFirstName(params.parentFirstName);
  const greeting = firstName ? `Hello ${firstName},` : 'Hello,';
  
  const bodyHtml = `
    <p style="margin-top: 0;">${greeting}</p>
    <p>This is a reminder to keep ${childName}’s event pass ready for event day.</p>
    <p>The person picking up the child must match the pickup details saved in Parent Access.</p>
    <br>
    <p style="margin-bottom: 0;">Thank you,<br>Koinonia Children and Teens</p>
  `;
  
  const text = `${greeting}\n\nThis is a reminder to keep ${childName}’s event pass ready for event day.\n\nThe person picking up the child must match the pickup details saved in Parent Access.\n\nView pass here:\n${params.passLink}\n\nThank you,\nKoinonia Children and Teens`;

  const html = wrapHtmlTemplate(subject, bodyHtml, { label: 'View pass', url: params.passLink });

  return sendEmail({ to: params.parentEmail, subject, html, text });
}

// SMTP configuration for sending OTP emails from the Electron desktop app.
// These credentials are used by nodemailer in the Electron main process.
export const SMTP_CONFIG = {
  host: 'smtp.gmail.com',   // Change to your SMTP host
  port: 587,
  secure: false,            // true for port 465, false for 587
  user: 'noreply@buimerccorp.com',  // Your sender email
  pass: '',                 // App password (Gmail: generate in Google Account → Security → App Passwords)
};

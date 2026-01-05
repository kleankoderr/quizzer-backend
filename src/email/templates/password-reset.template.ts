export const getPasswordResetTemplate = (name: string, otp: string): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background-color: #f4f4f7;
      margin: 0;
      padding: 0;
      -webkit-text-size-adjust: none;
      width: 100% !important;
    }
    .container {
      max-width: 600px;
      background-color: #ffffff;
      padding: 40px;
      border-radius: 8px;
      margin: 40px auto 0;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #4F46E5; /* Indigo-600 */
      text-decoration: none;
    }
    .content {
      color: #333333;
      line-height: 1.6;
    }
    .otp-box {
      background-color: #F3F4F6;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 30px 0;
    }
    .otp-code {
      font-size: 32px;
      font-weight: bold;
      color: #1F2937;
      letter-spacing: 5px;
      display: inline-block;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 12px;
      color: #9CA3AF;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <a href="#" class="logo">Quizzer</a>
    </div>
    <div class="content">
      <p>Hello ${name},</p>
      <p>We received a request to reset your password for your Quizzer account. Please use the One-Time Password (OTP) below to proceed with the reset.</p>
      
      <div class="otp-box">
        <span class="otp-code">${otp}</span>
      </div>
      
      <p>This code will expire in <strong>10 minutes</strong>.</p>
      <p>If you did not request a password reset, please ignore this email and your password will remain unchanged.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Quizzer. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
};

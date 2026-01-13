export const getWelcomeBackEmailTemplate = (
  name: string,
  avgSessionsPerWeek: number = 4,
  schoolName?: string
): string => {
  const currentYear = new Date().getFullYear();

  // Smart Context: highly personalized, short, and punchy
  const headline = schoolName
    ? `Everyone at ${schoolName} is getting ahead.`
    : `Your study flow is waiting.`;

  const bodyOne = schoolName
    ? `We noticed things are moving fast at <strong>${schoolName}</strong>. Your peers are averaging <strong>${avgSessionsPerWeek} study sessions</strong> this week.`
    : `Data shows that consistency is the only "hack" that matters. Active learners are clocking in <strong>${avgSessionsPerWeek} sessions</strong> a week.`;

  const bodyTwo = schoolName
    ? `Don't get left behind. It only takes 5 minutes to catch up.`
    : `You don't need to study hard. You just need to start.`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome Back to Quizzer</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #111827; margin: 0; padding: 0; background-color: #f9fafb; }
    .container { max-width: 500px; margin: 40px auto; background: #ffffff; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .logo { color: #4F46E5; font-weight: 800; font-size: 24px; text-decoration: none; display: block; margin-bottom: 32px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 24px; color: #111827; letter-spacing: -0.025em; }
    p { margin-bottom: 24px; font-size: 16px; color: #374151; }
    strong { color: #111827; font-weight: 600; }
    .btn { display: inline-block; background-color: #4F46E5; color: #ffffff !important; padding: 14px 32px; font-size: 16px; font-weight: 500; text-decoration: none; border-radius: 99px; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
    .footer { margin-top: 40px; padding-top: 24px; border-top: 1px solid #f3f4f6; font-size: 13px; color: #9ca3af; text-align: center; }
    .footer a { color: #6b7280; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <a href="https://quizzer.kleankoder.com/" class="logo">Quizzer.</a>
    
    <h1>Hi ${name},</h1>
    
    <h1>${headline}</h1>

    <p>${bodyOne}</p>
    
    <p>${bodyTwo}</p>

    <div style="margin: 32px 0;">
      <a href="https://quizzer.kleankoder.com/" class="btn">Resume Learning</a>
    </div>

    <p style="font-size: 14px; color: #6B7280; margin-top: 32px; border-left: 2px solid #E5E7EB; padding-left: 16px;">
      "Success is the sum of small efforts, repeated day in and day out."
    </p>

    <div class="footer">
      <p>© ${currentYear} Quizzer. Study Smarter.</p>
    </div>
  </div>
</body>
</html>
  `;
};

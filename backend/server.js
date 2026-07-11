const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_PATH = path.join(__dirname, 'db.json');

// ─── Email Configuration ─────────────────────────────────────────────────────
// For production, set these environment variables. For development, Ethereal is used as fallback.
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.ethereal.email';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@ginormousinvestments.com';
const FROM_NAME = process.env.FROM_NAME || 'Ginormous Investments';
const APP_URL = process.env.APP_URL || 'http://localhost:5000';

let transporter = null;

async function initMailTransporter() {
  if (SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  } else {
    // Create Ethereal test account for development
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
    console.log('📧 Using Ethereal test email account:', testAccount.user);
  }
  // Verify connection
  try {
    await transporter.verify();
    console.log('✅ Mail transporter is ready');
  } catch (err) {
    console.warn('⚠️ Mail transporter verification failed:', err.message);
    console.warn('   Emails will be logged to console instead.');
    transporter = null;
  }
}

async function sendEmail({ to, subject, html }) {
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to,
        subject,
        html
      });
      console.log(`📧 Email sent to ${to}: ${info.messageId}`);
      if (info.messageId && !SMTP_USER) {
        console.log('   Preview URL:', nodemailer.getTestMessageUrl(info));
      }
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error('❌ Failed to send email:', err.message);
      // Fall through to console logging
    }
  }
  // Fallback: log to console
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📨 EMAIL TO: ${to}`);
  console.log(`📧 SUBJECT: ${subject}`);
  console.log(`📄 BODY:\n${html.replace(/<[^>]*>/g, '')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return { success: true, logged: true };
}

// ─── Multer config for image uploads ─────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', 'Homepage', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `prop_${Date.now()}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'Homepage')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ─── Data helpers ────────────────────────────────────────────────────────────
function loadData() {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Token helpers ───────────────────────────────────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── Activity logging ────────────────────────────────────────────────────────
function logActivity(activityType, user, details) {
  const data = loadData();
  if (!data.activityLog) {
    data.activityLog = [];
  }
  const activity = {
    id: `activity_${Date.now()}`,
    type: activityType,
    user: user || 'Unknown',
    details,
    timestamp: new Date().toISOString()
  };
  data.activityLog.push(activity);
  saveData(data);
  return activity;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── REGISTER ────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, position, role = 'staff', image } = req.body;
  if (!email || !password || !name || !position) {
    return res.status(400).json({ error: 'Missing required fields: email, password, name, position.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const data = loadData();
  if (data.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Email already exists.' });
  }

  const newUser = {
    email: email.toLowerCase(),
    password,
    name,
    position,
    role,
    image: image || '',
    status: 'active',
    verified: false,
    joinedAt: new Date().toISOString().split('T')[0]
  };

  data.users.push(newUser);

  // Generate verification token
  const token = generateToken();
  const tokenHash = hashToken(token);
  if (!data.verificationTokens) data.verificationTokens = [];
  data.verificationTokens.push({
    email: email.toLowerCase(),
    token: tokenHash,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  });
  saveData(data);

  // Send verification email
  const verifyLink = `${APP_URL}/verify-email.html?token=${token}&email=${encodeURIComponent(email.toLowerCase())}`;
  await sendEmail({
    to: email,
    subject: 'Verify your email — Ginormous Investments',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #1a1a2e; font-size: 24px;">Ginormous Investments</h1>
        </div>
        <h2 style="color: #333;">Welcome, ${name}!</h2>
        <p style="color: #555; font-size: 16px; line-height: 1.5;">
          Thank you for creating an account. Please verify your email address by clicking the button below.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyLink}" style="background-color: #1a1a2e; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #888; font-size: 14px;">
          This link will expire in 24 hours. If you did not create this account, please ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #aaa; font-size: 12px; text-align: center;">
          &copy; ${new Date().getFullYear()} Ginormous Investments. All rights reserved.
        </p>
      </div>
    `
  });

  logActivity('USER_REGISTERED', email, `New user registered: ${name} (${email}) as ${role}`);
  const { password: _, ...safeUser } = newUser;
  res.status(201).json({ user: safeUser, message: 'Registration successful. Please check your email to verify your account.' });
});

// ─── VERIFY EMAIL ────────────────────────────────────────────────────────────
app.post('/api/auth/verify-email', (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) {
    return res.status(400).json({ error: 'Email and token are required.' });
  }

  const data = loadData();
  const tokenHash = hashToken(token);
  const storedToken = (data.verificationTokens || []).find(
    t => t.email === email.toLowerCase() && t.token === tokenHash
  );

  if (!storedToken) {
    return res.status(400).json({ error: 'Invalid or expired verification token.' });
  }

  if (storedToken.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'Verification token has expired. Please request a new one.' });
  }

  // Mark user as verified
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  user.verified = true;

  // Remove used token
  data.verificationTokens = data.verificationTokens.filter(
    t => !(t.email === email.toLowerCase() && t.token === tokenHash)
  );
  saveData(data);

  logActivity('EMAIL_VERIFIED', email, `Email verified for ${user.name}`);
  res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
});

// ─── RESEND VERIFICATION ─────────────────────────────────────────────────────
app.post('/api/auth/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const data = loadData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (user.verified) {
    return res.status(400).json({ error: 'Email is already verified.' });
  }

  // Remove old tokens for this email
  data.verificationTokens = (data.verificationTokens || []).filter(
    t => t.email !== email.toLowerCase()
  );

  // Generate new token
  const token = generateToken();
  const tokenHash = hashToken(token);
  if (!data.verificationTokens) data.verificationTokens = [];
  data.verificationTokens.push({
    email: email.toLowerCase(),
    token: tokenHash,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  });
  saveData(data);

  const verifyLink = `${APP_URL}/verify-email.html?token=${token}&email=${encodeURIComponent(email.toLowerCase())}`;
  await sendEmail({
    to: email,
    subject: 'Resend: Verify your email — Ginormous Investments',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #1a1a2e; font-size: 24px;">Ginormous Investments</h1>
        </div>
        <h2 style="color: #333;">Verify Your Email</h2>
        <p style="color: #555; font-size: 16px; line-height: 1.5;">
          You requested a new verification link. Click the button below to verify your email address.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyLink}" style="background-color: #1a1a2e; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #888; font-size: 14px;">
          This link will expire in 24 hours.
        </p>
      </div>
    `
  });

  res.json({ success: true, message: 'Verification email resent. Please check your inbox.' });
});

// ─── LOGIN (updated to check verification) ───────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const data = loadData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!user) {
    logActivity('LOGIN_FAILED', email, `Failed login attempt with invalid credentials`);
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  if (user.verified === false) {
    logActivity('LOGIN_FAILED', email, `Login attempt by unverified user`);
    return res.status(403).json({ error: 'Please verify your email before logging in. Check your inbox for the verification link.', needsVerification: true });
  }

  if (user.status === 'suspended') {
    logActivity('LOGIN_FAILED', email, `Login attempt by suspended user`);
    return res.status(403).json({ error: 'Your account has been suspended. Contact an administrator.' });
  }

  logActivity('LOGIN_SUCCESS', user.email, `User ${user.name} (${user.role}) logged in`);
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

// ─── FORGOT PASSWORD ─────────────────────────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const data = loadData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    // Don't reveal whether the email exists for security
    return res.json({ success: true, message: 'If that email is registered, a password reset link has been sent.' });
  }

  // Remove old reset tokens for this email
  data.resetTokens = (data.resetTokens || []).filter(t => t.email !== email.toLowerCase());

  // Generate reset token
  const token = generateToken();
  const tokenHash = hashToken(token);
  if (!data.resetTokens) data.resetTokens = [];
  data.resetTokens.push({
    email: email.toLowerCase(),
    token: tokenHash,
    expiresAt: Date.now() + 1 * 60 * 60 * 1000 // 1 hour
  });
  saveData(data);

  const resetLink = `${APP_URL}/reset-password.html?token=${token}&email=${encodeURIComponent(email.toLowerCase())}`;
  await sendEmail({
    to: email,
    subject: 'Reset your password — Ginormous Investments',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #1a1a2e; font-size: 24px;">Ginormous Investments</h1>
        </div>
        <h2 style="color: #333;">Reset Your Password</h2>
        <p style="color: #555; font-size: 16px; line-height: 1.5;">
          You requested a password reset. Click the button below to set a new password.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #1a1a2e; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-size: 16px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #888; font-size: 14px;">
          This link will expire in 1 hour. If you did not request a password reset, please ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #aaa; font-size: 12px; text-align: center;">
          &copy; ${new Date().getFullYear()} Ginormous Investments. All rights reserved.
        </p>
      </div>
    `
  });

  res.json({ success: true, message: 'If that email is registered, a password reset link has been sent.' });
});

// ─── RESET PASSWORD ──────────────────────────────────────────────────────────
app.post('/api/auth/reset-password', (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'Email, token, and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const data = loadData();
  const tokenHash = hashToken(token);
  const storedToken = (data.resetTokens || []).find(
    t => t.email === email.toLowerCase() && t.token === tokenHash
  );

  if (!storedToken) {
    return res.status(400).json({ error: 'Invalid or expired reset token.' });
  }

  if (storedToken.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
  }

  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  user.password = newPassword;

  // Remove used token
  data.resetTokens = data.resetTokens.filter(
    t => !(t.email === email.toLowerCase() && t.token === tokenHash)
  );
  saveData(data);

  logActivity('PASSWORD_RESET', email, `Password reset for ${user.name}`);
  res.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
});

// ─── CHECK AUTH STATUS ──────────────────────────────────────────────────────
app.post('/api/auth/check-status', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  const data = loadData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.json({ exists: false });
  }
  res.json({
    exists: true,
    verified: user.verified || false,
    status: user.status
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXISTING ENDPOINTS (unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/content', (req, res) => {
  const data = loadData();
  res.json(data.content);
});

app.post('/api/content', (req, res) => {
  const update = req.body;
  if (!update || typeof update !== 'object') {
    return res.status(400).json({ error: 'Invalid payload.' });
  }
  const data = loadData();
  data.content = { ...data.content, ...update };
  saveData(data);
  res.json({ success: true, content: data.content });
});

app.get('/api/users', (req, res) => {
  const data = loadData();
  const { role } = req.query;
  if (role) {
    res.json(data.users.filter(u => u.role === role));
  } else {
    res.json(data.users.map(({ password, ...rest }) => rest));
  }
});

app.post('/api/users', (req, res) => {
  const { email, password, name, position, role = 'staff', image } = req.body;
  if (!email || !password || !name || !position) {
    return res.status(400).json({ error: 'Missing required user fields.' });
  }
  const data = loadData();
  if (data.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Email already exists.' });
  }
  const newUser = { email: email.toLowerCase(), password, name, position, role, image: image || '', status: 'active', verified: true, joinedAt: new Date().toISOString().split('T')[0] };
  data.users.push(newUser);
  saveData(data);
  logActivity('USER_CREATED', req.body.createdBy || 'system', `New user created: ${name} (${email}) as ${role}`);
  const { password: _, ...safeUser } = newUser;
  res.status(201).json({ user: safeUser });
});

app.delete('/api/users/:email', (req, res) => {
  const email = req.params.email.toLowerCase();
  const data = loadData();
  const existing = data.users.find(u => u.email.toLowerCase() === email);
  if (!existing) {
    return res.status(404).json({ error: 'User not found.' });
  }
  logActivity('USER_DELETED', req.body?.deletedBy || 'system', `User deleted: ${existing.name} (${email})`);
  data.users = data.users.filter(u => u.email.toLowerCase() !== email);
  saveData(data);
  res.json({ success: true });
});

app.patch('/api/users/promote', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  const data = loadData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  user.role = 'admin';
  saveData(data);
  logActivity('USER_PROMOTED', req.body.promotedBy || 'system', `${user.name} (${user.email}) promoted to admin`);
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.patch('/api/users/demote', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  const data = loadData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (user.role !== 'admin') {
    return res.status(400).json({ error: 'User is not an admin.' });
  }
  user.role = 'staff';
  saveData(data);
  logActivity('USER_DEMOTED', req.body.demotedBy || 'system', `${user.name} (${user.email}) demoted to staff`);
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.patch('/api/users/suspend', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  const data = loadData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  user.status = 'suspended';
  saveData(data);
  logActivity('USER_SUSPENDED', req.body.suspendedBy || 'system', `${user.name} (${user.email}) suspended`);
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.patch('/api/users/unsuspend', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  const data = loadData();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  user.status = 'active';
  saveData(data);
  logActivity('USER_UNSUSPENDED', req.body.unsuspendedBy || 'system', `${user.name} (${user.email}) unsuspended`);
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.patch('/api/users/:email', (req, res) => {
  const email = req.params.email.toLowerCase();
  const { name, position, password } = req.body;
  const data = loadData();
  const user = data.users.find(u => u.email.toLowerCase() === email);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (name) user.name = name;
  if (position) user.position = position;
  if (password) user.password = password;
  saveData(data);
  logActivity('USER_UPDATED', req.body.updatedBy || 'system', `${user.name} (${user.email}) updated`);
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

// Image upload endpoint
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const url = `uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename });
});

app.get('/api/properties', (req, res) => {
  const data = loadData();
  res.json(data.properties);
});

app.post('/api/properties', (req, res) => {
  const { title, description, tag, price, currency = 'NGN', meta, image, prices, status = 'available' } = req.body;
  if (!title || !description || !tag) {
    return res.status(400).json({ error: 'Missing required property fields.' });
  }
  const data = loadData();
  const property = {
    id: `p${data.properties.length + 1}`,
    title,
    description,
    tag,
    price: price || (prices ? prices.plot : 0),
    currency,
    meta: meta || '',
    image: image || '',
    prices: prices || { plot: price || 0, acre: (price || 0) * 2.4, hectare: (price || 0) * 6 },
    status,
    createdAt: new Date().toISOString()
  };
  data.properties.push(property);
  saveData(data);
  logActivity('PROPERTY_ADDED', req.body.addedBy || 'system', `Property added: ${title}`);
  res.status(201).json({ property });
});

app.patch('/api/properties/:id', (req, res) => {
  const id = req.params.id;
  const data = loadData();
  const property = data.properties.find(p => p.id === id);
  if (!property) {
    return res.status(404).json({ error: 'Property not found.' });
  }
  Object.assign(property, req.body);
  saveData(data);
  logActivity('PROPERTY_UPDATED', req.body.updatedBy || 'system', `Property updated: ${property.title}`);
  res.json({ property });
});

app.delete('/api/properties/:id', (req, res) => {
  const id = req.params.id;
  const data = loadData();
  const property = data.properties.find(p => p.id === id);
  if (!property) {
    return res.status(404).json({ error: 'Property not found.' });
  }
  logActivity('PROPERTY_DELETED', req.body?.deletedBy || 'system', `Property deleted: ${property.title}`);
  data.properties = data.properties.filter(p => p.id !== id);
  saveData(data);
  res.json({ success: true });
});

app.post('/api/orders', (req, res) => {
  const { items, customerName, customerEmail, phone, amount } = req.body;
  if (!Array.isArray(items) || items.length === 0 || !customerName || !customerEmail || !amount) {
    return res.status(400).json({ error: 'Missing required order fields.' });
  }
  const data = loadData();
  const orderId = `order_${Date.now()}`;
  const order = {
    id: orderId,
    items,
    customerName,
    customerEmail,
    phone,
    amount,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  data.orders.push(order);
  saveData(data);
  res.status(201).json({ order });
});

app.get('/api/orders', (req, res) => {
  const data = loadData();
  res.json(data.orders);
});

// Events API
app.get('/api/events', (req, res) => {
  const data = loadData();
  res.json(data.events || []);
});

app.post('/api/events', (req, res) => {
  const { title, description, date, time, location, image } = req.body;
  if (!title || !date || !time || !location) {
    return res.status(400).json({ error: 'Missing required event fields.' });
  }
  const data = loadData();
  if (!data.events) data.events = [];
  
  const event = {
    id: `event_${Date.now()}`,
    title,
    description,
    date,
    time,
    location,
    image,
    createdAt: new Date().toISOString()
  };
  data.events.push(event);
  saveData(data);
  logActivity('EVENT_CREATED', req.body.createdBy || 'system', `Event created: ${title} on ${date}`);
  res.status(201).json({ event });
});

app.patch('/api/events/:id', (req, res) => {
  const id = req.params.id;
  const data = loadData();
  if (!data.events) data.events = [];
  const event = data.events.find(e => e.id === id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }
  Object.assign(event, req.body);
  saveData(data);
  logActivity('EVENT_UPDATED', req.body.updatedBy || 'system', `Event updated: ${event.title}`);
  res.json({ event });
});

app.delete('/api/events/:id', (req, res) => {
  const id = req.params.id;
  const data = loadData();
  if (!data.events) data.events = [];
  const event = data.events.find(e => e.id === id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }
  logActivity('EVENT_DELETED', req.body?.deletedBy || 'system', `Event deleted: ${event.title}`);
  data.events = data.events.filter(e => e.id !== id);
  saveData(data);
  res.json({ success: true });
});

app.post('/api/payments/initialize', (req, res) => {
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ error: 'Order ID is required.' });
  }
  const data = loadData();
  const order = data.orders.find(o => o.id === orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }
  const reference = `pay_${Date.now()}`;
  data.payments.push({ reference, orderId, status: 'initialized', createdAt: new Date().toISOString() });
  saveData(data);
  res.json({ reference, amount: order.amount, customerEmail: order.customerEmail });
});

app.post('/api/payments/verify', (req, res) => {
  const { reference, success } = req.body;
  if (!reference) {
    return res.status(400).json({ error: 'Payment reference is required.' });
  }
  const data = loadData();
  const payment = data.payments.find(p => p.reference === reference);
  if (!payment) {
    return res.status(404).json({ error: 'Payment not found.' });
  }
  payment.status = success ? 'completed' : 'failed';
  const order = data.orders.find(o => o.id === payment.orderId);
  if (order) {
    order.status = success ? 'paid' : 'failed';
  }
  saveData(data);
  logActivity('PAYMENT_VERIFIED', 'system', `Payment ${reference} marked as ${payment.status}`);
  res.json({ payment, order });
});

// Activity Log API Endpoints
app.get('/api/activity-log', (req, res) => {
  const data = loadData();
  const activityLog = data.activityLog || [];
  const { type, user, limit = 100 } = req.query;
  
  let filtered = activityLog;
  if (type) filtered = filtered.filter(a => a.type === type);
  if (user) filtered = filtered.filter(a => a.user.toLowerCase().includes(user.toLowerCase()));
  
  filtered = filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  filtered = filtered.slice(0, parseInt(limit));
  res.json(filtered);
});

app.get('/api/activity-log/stats', (req, res) => {
  const data = loadData();
  const activityLog = data.activityLog || [];
  
  const stats = {
    totalActivities: activityLog.length,
    activityTypes: {},
    usersActive: new Set(),
    lastActivity: activityLog.length > 0 ? activityLog[activityLog.length - 1].timestamp : null
  };
  
  activityLog.forEach(activity => {
    stats.activityTypes[activity.type] = (stats.activityTypes[activity.type] || 0) + 1;
    stats.usersActive.add(activity.user);
  });
  
  stats.usersActive = Array.from(stats.usersActive);
  res.json(stats);
});

app.delete('/api/activity-log', (req, res) => {
  const data = loadData();
  const deletedCount = (data.activityLog || []).length;
  data.activityLog = [];
  saveData(data);
  logActivity('ACTIVITY_LOG_CLEARED', 'admin', `Activity log cleared (${deletedCount} entries removed)`);
  res.json({ success: true, deletedCount });
});

app.delete('/api/activity-log/:id', (req, res) => {
  const data = loadData();
  const id = req.params.id;
  const index = (data.activityLog || []).findIndex(a => a.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Activity log entry not found.' });
  }
  
  data.activityLog.splice(index, 1);
  saveData(data);
  res.json({ success: true });
});

app.get('/api/dashboard/stats', (req, res) => {
  const data = loadData();
  const staffCount = data.users.filter(u => u.role === 'staff').length;
  const adminCount = data.users.filter(u => u.role === 'admin').length;
  const totalProperties = data.properties.length;
  const totalOrders = data.orders.length;
  res.json({ staffCount, adminCount, totalProperties, totalOrders });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '..', 'Homepage', 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// ─── Start server ────────────────────────────────────────────────────────────
async function startServer() {
  await initMailTransporter();
  app.listen(PORT, () => {
    console.log(`Ginormous Investments API listening on http://localhost:${PORT}`);
    console.log(`App URL: ${APP_URL}`);
  });
}

startServer();
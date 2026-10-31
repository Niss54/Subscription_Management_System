const crypto = require('node:crypto');
const { getDb } = require('../db');

// Brightloop Problem Statement Password Regex:
// Length must strictly exceed 8 characters (>= 9), uppercase, lowercase, special character.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\W).{9,}$/;

function validatePasswordComplexity(password) {
  if (!password || !PASSWORD_REGEX.test(password)) {
    throw new Error(
      "Password must be more than 8 characters and contain at least one uppercase letter, one lowercase letter, and one special character."
    );
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'utf-8'), Buffer.from(originalHash, 'utf-8'));
}

function generateToken(payload, secret = 'brightloop-secret-key-32chars-minimum-token', expiresInMs = 24 * 60 * 60 * 1000) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Date.now() + expiresInMs;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token, secret = 'brightloop-secret-key-32chars-minimum-token') {
  try {
    const [header, body, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'utf-8'), Buffer.from(expectedSig, 'utf-8'))) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

function registerUser({ email, password, full_name, role = 'customer' }) {
  const db = getDb();
  validatePasswordComplexity(password);

  const existing = db.prepare('SELECT id FROM profiles WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    throw new Error("Email is already registered.");
  }

  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);

  db.prepare(`
    INSERT INTO profiles (id, email, full_name, password_hash, role, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(id, email.toLowerCase(), full_name, passwordHash, role);

  const token = generateToken({ sub: id, email: email.toLowerCase(), role, name: full_name });
  return { id, email: email.toLowerCase(), full_name, role, token };
}

function loginUser({ email, password }) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM profiles WHERE email = ? AND is_active = 1').get(email.toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error("Invalid email or password.");
  }

  const token = generateToken({ sub: user.id, email: user.email, role: user.role, name: user.full_name });
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    token
  };
}

function requestPasswordReset(email) {
  const db = getDb();
  const user = db.prepare('SELECT id FROM profiles WHERE email = ? AND is_active = 1').get(email.toLowerCase());
  if (!user) {
    // Return mock success to prevent email enumeration
    return { success: true, message: "If the email is registered, a password reset link has been issued." };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes validity
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used)
    VALUES (?, ?, ?, ?, 0)
  `).run(id, user.id, tokenHash, expiresAt);

  return {
    success: true,
    resetToken: rawToken,
    expiresAt,
    message: "Reset token generated successfully (15-minute validity)."
  };
}

function resetPasswordWithToken(rawToken, newPassword) {
  const db = getDb();
  validatePasswordComplexity(newPassword);

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const resetEntry = db.prepare(`
    SELECT * FROM password_reset_tokens 
    WHERE token_hash = ? AND used = 0
  `).get(tokenHash);

  if (!resetEntry) {
    throw new Error("Password reset token is invalid or has already been used.");
  }

  if (new Date(resetEntry.expires_at).getTime() < Date.now()) {
    throw new Error("Password reset token has expired.");
  }

  // Atomically invalidate token and update password
  const newPasswordHash = hashPassword(newPassword);

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(resetEntry.id);
    db.prepare('UPDATE profiles SET password_hash = ? WHERE id = ?').run(newPasswordHash, resetEntry.user_id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { success: true, message: "Password updated successfully." };
}

function createStaffAccount(adminUserId, { email, password, full_name }) {
  const db = getDb();
  const admin = db.prepare('SELECT role FROM profiles WHERE id = ?').get(adminUserId);
  if (!admin || admin.role !== 'admin') {
    throw new Error("Forbidden: Only administrators can provision staff accounts.");
  }
  return registerUser({ email, password, full_name, role: 'staff' });
}

module.exports = {
  PASSWORD_REGEX,
  validatePasswordComplexity,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  registerUser,
  loginUser,
  requestPasswordReset,
  resetPasswordWithToken,
  createStaffAccount
};

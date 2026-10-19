'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User } = require('../../models/User');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../../utils/tokens');

const BCRYPT_ROUNDS = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    avatar: user.avatar,
    isActive: user.isActive,
    vendorProfile: user.vendorProfile,
    createdAt: user.createdAt,
  };
}

function makeError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ── Register ──────────────────────────────────────────────────────────────────

async function registerUser(input) {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw makeError('An account with this email already exists.', 409);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: input.role || 'customer',
  });

  const payload = { userId: user._id.toString(), role: user.role, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user._id.toString());

  return { user: buildPublicUser(user), accessToken, refreshToken };
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function loginUser(input) {
  const user = await User.findByEmail(input.email);

  // Constant-time comparison — always run bcrypt even for unknown users
  const dummyHash = '$2b$12$invalidhashforunknownusertoblocktimingattacksXXXXXXXXXXXX';
  const passwordMatch = user
    ? await user.comparePassword(input.password)
    : await bcrypt.compare(input.password, dummyHash).then(() => false);

  if (!user || !passwordMatch) {
    throw makeError('Invalid email or password.', 401);
  }

  if (!user.isActive) {
    throw makeError('Account is deactivated. Please contact support.', 403);
  }

  const payload = { userId: user._id.toString(), role: user.role, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(user._id.toString());

  return { user: buildPublicUser(user), accessToken, refreshToken };
}

// ── Refresh access token ──────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw makeError('Invalid or expired refresh token.', 401);
  }

  const user = await User.findById(decoded.userId);
  if (!user || !user.isActive) {
    throw makeError('User not found or deactivated.', 401);
  }

  const payload = { userId: user._id.toString(), role: user.role, email: user.email };
  const newAccessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(user._id.toString());

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

// ── Get current user ──────────────────────────────────────────────────────────

async function getCurrentUser(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw makeError('User not found.', 404);
  }
  return buildPublicUser(user);
}

// ── Update profile ────────────────────────────────────────────────────────────

async function updateProfile(userId, input) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw makeError('User not found.', 404);
  }

  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;

  if (input.vendorProfile && user.role === 'organizer') {
    if (!user.vendorProfile) {
      user.vendorProfile = { approved: false };
    }
    if (input.vendorProfile.orgName !== undefined) user.vendorProfile.orgName = input.vendorProfile.orgName;
    if (input.vendorProfile.bio !== undefined) user.vendorProfile.bio = input.vendorProfile.bio;
    if (input.vendorProfile.website !== undefined) user.vendorProfile.website = input.vendorProfile.website;
  }

  await user.save();
  return buildPublicUser(user);
}

// ── Change password ───────────────────────────────────────────────────────────

async function changePassword(userId, input) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !user.isActive) {
    throw makeError('User not found.', 404);
  }

  const valid = await user.comparePassword(input.currentPassword);
  if (!valid) {
    throw makeError('Current password is incorrect.', 400);
  }

  user.passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  await user.save();
}

// ── Forgot password ───────────────────────────────────────────────────────────

async function forgotPassword(email) {
  const user = await User.findOne({ email });
  if (!user || !user.isActive) return null;

  const rawToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });
  return rawToken;
}

// ── Reset password ────────────────────────────────────────────────────────────

async function resetPassword(rawToken, newPassword) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordHash +passwordResetTokenHash +passwordResetExpires');

  if (!user) {
    throw makeError('Reset token is invalid or has expired.', 400);
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
}

module.exports = {
  registerUser,
  loginUser,
  refreshAccessToken,
  getCurrentUser,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
};

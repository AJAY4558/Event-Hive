'use strict';

const authService = require('../services/auth/authService');
const { setRefreshTokenCookie, clearRefreshTokenCookie } = require('../utils/tokens');

async function register(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await authService.registerUser(req.body);
    setRefreshTokenCookie(res, refreshToken);
    res.status(201).json({ user, accessToken });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { user, accessToken, refreshToken } = await authService.loginUser(req.body);
    setRefreshTokenCookie(res, refreshToken);
    res.status(200).json({ user, accessToken });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken: oldToken } = req.cookies;
    const { accessToken, refreshToken } = await authService.refreshAccessToken(oldToken);
    setRefreshTokenCookie(res, refreshToken);
    res.status(200).json({ accessToken });
  } catch (err) {
    next(err);
  }
}

async function logout(_req, res, _next) {
  clearRefreshTokenCookie(res);
  res.status(200).json({ message: 'Logged out successfully.' });
}

async function me(req, res, next) {
  try {
    const { userId } = req.user;
    const user = await authService.getCurrentUser(userId);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { userId } = req.user;
    const user = await authService.updateProfile(userId, req.body);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const { userId } = req.user;
    await authService.changePassword(userId, req.body);
    clearRefreshTokenCookie(res);
    res.status(200).json({ message: 'Password changed successfully. Please log in again.' });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const rawToken = await authService.forgotPassword(email);

    const devResponse = process.env.NODE_ENV === 'test' && rawToken ? { _devToken: rawToken } : {};

    res.status(200).json({
      message: 'If an account with that email exists, a reset link has been sent.',
      ...devResponse,
    });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const { password } = req.body;
    await authService.resetPassword(token, password);
    clearRefreshTokenCookie(res);
    res.status(200).json({ message: 'Password reset successful. Please log in.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
};

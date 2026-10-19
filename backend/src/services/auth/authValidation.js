'use strict';

const { z } = require('zod');

// ── Reusable primitives ───────────────────────────────────────────────────────

const emailSchema = z
  .string({ required_error: 'Email is required' })
  .email('Invalid email address')
  .toLowerCase()
  .trim();

const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password cannot exceed 72 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit');

// ── Register ──────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(80, 'Name cannot exceed 80 characters'),
    email: emailSchema,
    password: passwordSchema,
    role: z.enum(['customer', 'organizer']).optional().default('customer'),
  }),
});

// ── Login ─────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string({ required_error: 'Password is required' }).min(1),
  }),
});

// ── Refresh token ─────────────────────────────────────────────────────────────

const refreshSchema = z.object({
  cookies: z.object({
    refreshToken: z.string({ required_error: 'Refresh token cookie missing' }).min(1),
  }),
});

// ── Forgot password ───────────────────────────────────────────────────────────

const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

// ── Reset password ────────────────────────────────────────────────────────────

const resetPasswordSchema = z
  .object({
    params: z.object({
      token: z.string().min(1, 'Reset token is required'),
    }),
    body: z.object({
      password: passwordSchema,
      confirmPassword: z.string().min(1),
    }),
  })
  .refine((data) => data.body.password === data.body.confirmPassword, {
    message: 'Passwords do not match',
    path: ['body', 'confirmPassword'],
  });

// ── Update profile ────────────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s\-()]{7,20}$/, 'Invalid phone number')
      .optional(),
    vendorProfile: z
      .object({
        orgName: z.string().trim().max(120).optional(),
        bio: z.string().trim().max(500).optional(),
        website: z.string().url('Invalid URL').optional(),
      })
      .optional(),
  }),
});

// ── Change password ───────────────────────────────────────────────────────────

const changePasswordSchema = z
  .object({
    body: z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: passwordSchema,
      confirmNewPassword: z.string().min(1),
    }),
  })
  .refine((data) => data.body.newPassword === data.body.confirmNewPassword, {
    message: 'New passwords do not match',
    path: ['body', 'confirmNewPassword'],
  })
  .refine((data) => data.body.currentPassword !== data.body.newPassword, {
    message: 'New password must differ from current password',
    path: ['body', 'newPassword'],
  });

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
};

'use strict';

const { z } = require('zod');

/**
 * Validates req.body, req.params, req.query, and req.cookies against a Zod schema.
 * Returns 422 with structured field errors on failure.
 */
function validate(schema) {
  const zodSchema = schema && typeof schema.safeParse === 'function' ? schema : z.object(schema);

  return (req, res, next) => {
    const result = zodSchema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
      cookies: req.cookies,
    });

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      res.status(422).json({ error: 'Validation failed', fields: errors });
      return;
    }

    if (result.data.body !== undefined) req.body = result.data.body;
    if (result.data.params !== undefined) req.params = result.data.params;

    next();
  };
}

function formatZodErrors(error) {
  return error.issues.reduce((acc, issue) => {
    const key = issue.path.slice(1).join('.');
    acc[key || issue.path.join('.')] = issue.message;
    return acc;
  }, {});
}

module.exports = { validate };

import { z } from "zod";

/**
 * Shared request-body schemas, validated at the route boundary so handlers
 * can trust req.body's shape. Keeps validation declarative and in one place
 * instead of scattered `if (!x) return res.status(400)` checks.
 */
export const schemas = {
  signup: z.object({
    name: z.string().trim().min(2, "name must be at least 2 characters").max(100),
    email: z.string().trim().email("must be a valid email address"),
    password: z.string().min(8, "password must be at least 8 characters").max(128),
    phone: z.string().trim().max(20).optional(),
    organisation: z.string().trim().max(150).optional(),
    role: z.string().optional(), // server always forces "citizen" on signup regardless
  }),

  login: z.object({
    email: z.string().trim().email("must be a valid email address"),
    password: z.string().min(1, "password is required"),
  }),

  analyze: z.object({
    text: z.string().trim().min(1, "text is required").max(8000, "text is too long (max 8000 characters)"),
  }),

  report: z.object({
    channel: z.enum(["sms", "whatsapp", "email", "url", "notice_pdf", "audio", "screenshot"]),
    rawContent: z.string().trim().min(1, "rawContent is required").max(8000),
    evidenceRefs: z.array(z.string()).optional(),
    location: z
      .object({
        state: z.string().max(100).optional(),
        district: z.string().max(100).optional(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
      })
      .optional(),
  }),
};

/**
 * validate(schemaName) -> Express middleware. Parses req.body against the
 * named schema; on failure responds 400 with a field-level error list
 * instead of a generic message, on success replaces req.body with the
 * parsed (trimmed/coerced) value.
 */
export function validate(schemaName) {
  const schema = schemas[schemaName];
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
}

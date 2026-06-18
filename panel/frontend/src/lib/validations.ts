import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1, "validation.required"),
  password: z.string().min(1, "validation.required"),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "validation.required"),
    newPassword: z.string().min(6, "validation.passwordMin"),
    confirmPassword: z.string().min(1, "validation.required"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "validation.passwordMismatch",
    path: ["confirmPassword"],
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const tokenSchema = z.object({
  platform: z.enum(["vercel", "netlify", "azure", "railway", "fastly"]),
  label: z.string().min(1, "validation.required"),
  fields: z.record(z.string(), z.string().min(1, "validation.required")),
});
export type TokenValues = z.infer<typeof tokenSchema>;

export const deployStep1Schema = z.object({
  platform: z.enum(["vercel", "netlify", "azure", "railway", "fastly"]),
});

export const deployStep2Schema = z.object({
  tokenId: z.number().positive("validation.required"),
  projectName: z
    .string()
    .min(1, "validation.required")
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "validation.projectNameFormat"),
  targetDomain: z
    .string()
    .min(1, "validation.required")
    // Allow domain or IPv4 with optional :port
    .regex(
      /^(((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+)|((?:\d{1,3}\.){3}\d{1,3}))(?:\:(\d{2,5}))?$/,
      "validation.domainFormat"
    ),
  relayPath: z.string().min(1, "validation.required"),
  publicPath: z.string().min(1, "validation.required"),
  resourceGroup: z.string().optional(),
  sku: z.string().optional(),
  location: z.string().optional(),
  targetPort: z.number().int().min(1).max(65535).optional(),
  maxInflight: z.number().int().min(1).optional(),
  maxUpBps: z.number().int().min(0).optional(),
  maxDownBps: z.number().int().min(0).optional(),
  // Railway
  region: z.string().optional(),
  upstreamTimeoutMs: z.number().int().min(0).optional(),
  // Fastly
  customDomain: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "validation.projectNameFormat").optional().or(z.literal("")),
});
export type DeployStep2Values = z.infer<typeof deployStep2Schema>;

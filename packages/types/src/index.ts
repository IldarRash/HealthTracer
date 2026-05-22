import { z } from "zod";

export const apiStatusSchema = z.enum(["ok"]);

export type ApiStatus = z.infer<typeof apiStatusSchema>;

export const healthResponseSchema = z.object({
  status: apiStatusSchema,
  service: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

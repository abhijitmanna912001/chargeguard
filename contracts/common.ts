import { z } from "zod";

/**
 * Money in paise (1 INR = 100 paise). Safe integer only, never floats.
 * Capped at the 32-bit signed max so it fits a standard integer DB column.
 */
export const MAX_PAISE = 2147483647;
export const PaiseSchema = z.number().int().nonnegative().max(MAX_PAISE);
export type Paise = z.infer<typeof PaiseSchema>;

export const IdSchema = z.string().min(1);
export type Id = z.infer<typeof IdSchema>;

/** ISO 8601 date-time string. Never use Date objects in contracts. */
export const IsoDateTimeSchema = z.string().datetime();
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const CurrencySchema = z.literal("INR");
export type Currency = z.infer<typeof CurrencySchema>;

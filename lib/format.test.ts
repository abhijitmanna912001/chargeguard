import { describe, expect, it } from "vitest";
import { formatDateTime, formatDeadline, formatPaise, formatPaiseInText, humanizeEnum, isDeadlineUrgent } from "./format";

describe("formatPaise", () => {
  it("formats rupees with en-IN grouping and two decimals", () => {
    expect(formatPaise(249900)).toBe("₹2,499.00");
    expect(formatPaise(4500000)).toBe("₹45,000.00");
  });
  it("formats zero", () => {
    expect(formatPaise(0)).toBe("₹0.00");
  });
  it("uses lakh grouping", () => {
    expect(formatPaise(10000000)).toBe("₹1,00,000.00");
  });
  it("keeps the paise part", () => {
    expect(formatPaise(150)).toBe("₹1.50");
  });
});

describe("formatDeadline", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");
  const at = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();
  const H = 3_600_000;
  const D = 24 * H;

  it("counts days left for future deadlines", () => {
    expect(formatDeadline(at(2 * D), now)).toBe("2 days left");
    expect(formatDeadline(at(2.9 * D), now)).toBe("2 days left");
    expect(formatDeadline(at(D), now)).toBe("1 day left");
  });
  it("falls back to hours and minutes", () => {
    expect(formatDeadline(at(5 * H), now)).toBe("5 hours left");
    expect(formatDeadline(at(H), now)).toBe("1 hour left");
    expect(formatDeadline(at(30 * 60_000), now)).toBe("30 minutes left");
    expect(formatDeadline(at(30_000), now)).toBe("Less than a minute left");
  });
  it("reports overdue for past deadlines", () => {
    expect(formatDeadline(at(-3 * H), now)).toBe("Overdue by 3 hours");
    expect(formatDeadline(at(-3 * D), now)).toBe("Overdue by 3 days");
    expect(formatDeadline(at(-H), now)).toBe("Overdue by 1 hour");
    expect(formatDeadline(at(-10 * 60_000), now)).toBe("Overdue by 10 minutes");
    expect(formatDeadline(at(-30_000), now)).toBe("Overdue by less than a minute");
  });
  it("throws on an invalid date", () => {
    expect(() => formatDeadline("not a date", now)).toThrow();
  });
});

describe("humanizeEnum", () => {
  it("turns snake_case into a sentence-case label", () => {
    expect(humanizeEnum("in_transit")).toBe("In transit");
    expect(humanizeEnum("returned_to_origin")).toBe("Returned to origin");
    expect(humanizeEnum("whatsapp")).toBe("Whatsapp");
    expect(humanizeEnum("")).toBe("");
  });
});

describe("formatDateTime", () => {
  it("shows UTC instants in India time", () => {
    expect(formatDateTime("2026-11-02T04:30:00.000Z")).toBe("2 Nov 2026, 10:00 am IST");
  });
  it("rolls over the date across the UTC/IST boundary", () => {
    expect(formatDateTime("2026-11-02T20:00:00.000Z")).toMatch(/^3 Nov 2026, 1:30 am IST$/);
  });
  it("throws on an invalid date", () => {
    expect(() => formatDateTime("nope")).toThrow();
  });
});

describe("isDeadlineUrgent", () => {
  const now = new Date("2026-11-01T00:00:00.000Z");
  it("is urgent under 48 hours and when overdue", () => {
    expect(isDeadlineUrgent("2026-11-02T23:59:00.000Z", now)).toBe(true);
    expect(isDeadlineUrgent("2026-10-31T00:00:00.000Z", now)).toBe(true);
  });
  it("is not urgent at exactly 48 hours or later", () => {
    expect(isDeadlineUrgent("2026-11-03T00:00:00.000Z", now)).toBe(false);
    expect(isDeadlineUrgent("2026-11-20T00:00:00.000Z", now)).toBe(false);
  });
  it("throws on an invalid date", () => {
    expect(() => isDeadlineUrgent("nope", now)).toThrow();
  });
});

describe("formatPaiseInText", () => {
  it("rewrites every paise amount as rupees", () => {
    expect(formatPaiseInText("Amount 4500000 paise is above the 1000000 paise limit")).toBe(
      "Amount ₹45,000.00 is above the ₹10,000.00 limit",
    );
  });
  it("handles 'X of Y paise'", () => {
    expect(formatPaiseInText("Refunds issued: 100 of 4500000 paise disputed (partial)")).toBe(
      "Refunds issued: ₹1.00 of ₹45,000.00 disputed (partial)",
    );
  });
  it("leaves other numbers and text alone", () => {
    expect(formatPaiseInText("Deadline in 296 hour(s); 2 evidence record(s)")).toBe("Deadline in 296 hour(s); 2 evidence record(s)");
    expect(formatPaiseInText("")).toBe("");
  });
});

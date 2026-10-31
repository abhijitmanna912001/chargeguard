// SIMULATED payment provider endpoint. It stands in for the real provider so the
// submission flow can run end to end with synthetic data. Nothing here talks to
// a real network or bank.
import { z } from "zod";
import { DefensePackageSchema } from "@/contracts";

// Dev-only simulated provider state: idempotency key -> providerRef. Lives in
// this module's memory, so it is NOT safe across serverless instances or
// restarts. A real provider would store this durably.
const simulatedResponsesByKey = new Map<string, string>();

const ModeSchema = z.enum(["ok", "fail", "reject"]).catch("ok");

function simulatedError(status: number, message: string) {
  return Response.json({ simulated: true, error: message }, { status });
}

export async function POST(request: Request) {
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (!key || key.length > 200) return simulatedError(400, "Idempotency-Key header is required.");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return simulatedError(400, "Request body must be valid JSON.");
  }
  const body = DefensePackageSchema.safeParse(raw);
  if (!body.success) return simulatedError(400, "Request body is not a valid defense package.");

  const mode = ModeSchema.parse(process.env.MOCK_PAYTM_MODE);
  if (mode === "fail") return simulatedError(503, "Simulated provider is unavailable.");
  if (mode === "reject") return simulatedError(422, "Simulated provider rejected the response.");

  // Same key, same answer: a replay never creates a second simulated record.
  let providerRef = simulatedResponsesByKey.get(key);
  if (!providerRef) {
    providerRef = `sim_ref_${crypto.randomUUID()}`;
    simulatedResponsesByKey.set(key, providerRef);
  }
  return Response.json({ simulated: true, providerRef });
}

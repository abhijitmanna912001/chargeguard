import { DisputeNotFoundError, ProviderSubmissionFailedError, SubmissionNotAllowedError } from "@/lib/services/errors";
import { submitDefense } from "@/lib/services/submit-defense";
import { SubmitDefenseInputSchema } from "@/app/disputes/[id]/schemas";

// POST is never cached by Next.js, so no route config is needed. Dispute status
// is read from the database on every call.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = SubmitDefenseInputSchema.safeParse({ disputeId: id });
  if (!parsed.success) return Response.json({ error: "Invalid dispute id." }, { status: 400 });

  try {
    const { submission, alreadySubmitted } = await submitDefense(parsed.data.disputeId, {
      now: () => new Date(),
      createId: () => crypto.randomUUID(),
    });
    return Response.json({
      status: submission.status,
      providerRef: submission.providerRef,
      submittedAt: submission.submittedAt,
      alreadySubmitted,
    });
  } catch (err) {
    if (err instanceof DisputeNotFoundError) return Response.json({ error: "Dispute not found." }, { status: 404 });
    if (err instanceof SubmissionNotAllowedError) {
      return Response.json({ error: "This dispute is not ready to be submitted." }, { status: 409 });
    }
    if (err instanceof ProviderSubmissionFailedError) {
      return Response.json({ error: "The payment provider did not accept the response." }, { status: 502 });
    }
    console.error("POST /api/disputes/[id]/submit failed", err);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

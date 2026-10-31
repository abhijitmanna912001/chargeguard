import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { EvalResultsSchema, type EvalResults } from "@/contracts";

export type LoadEvalResult =
  | { status: "ok"; results: EvalResults }
  | { status: "missing" }
  | { status: "invalid"; message: string };

/** Written by scripts/eval-agent.mts. Never edited by hand. */
export const EVAL_RESULTS_PATH = path.join(process.cwd(), "eval", "results.json");

/**
 * Reads and validates the evaluation results. Never throws, and the message
 * never carries a stack trace, a file path or any value from the file.
 *
 * It uses async readFile on purpose: under Cache Components a synchronous read
 * is treated as a "predictable value" and frozen into the build-time shell, so a
 * later `npm run eval` would not show up. The caller must sit inside Suspense.
 */
export async function loadEvalResults(filePath: string = EVAL_RESULTS_PATH): Promise<LoadEvalResult> {
  let text: string;
  try {
    // turbopackIgnore: the file is generated at runtime by `npm run eval`, so it
    // must not be traced into the build output (a variable path would trace the whole project).
    text = await readFile(/*turbopackIgnore: true*/ filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { status: "missing" };
    return { status: "invalid", message: "The evaluation results file could not be read." };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: "invalid", message: "The evaluation results file is not valid JSON. Run npm run eval again." };
  }

  const parsed = EvalResultsSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first && first.path.length > 0 ? ` (${first.path.join(".")})` : "";
    return {
      status: "invalid",
      message: `The evaluation results file does not match the expected format${where}. Run npm run eval again.`,
    };
  }
  return { status: "ok", results: parsed.data };
}

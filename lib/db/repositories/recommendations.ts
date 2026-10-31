import type { Recommendation } from "../../../contracts";
import { recommendationFromRow, recommendationToCreateData } from "../mappers";
import { prisma } from "../prisma";

export async function createRecommendation(
  rec: Recommendation,
): Promise<Recommendation> {
  const row = await prisma.recommendation.create({
    data: recommendationToCreateData(rec),
  });
  return recommendationFromRow(row);
}

/** Newest first, served by the (disputeId, createdAt) index. id breaks ties. */
export async function getLatestRecommendation(
  disputeId: string,
): Promise<Recommendation | null> {
  const row = await prisma.recommendation.findFirst({
    where: { disputeId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return row ? recommendationFromRow(row) : null;
}

import type { Recommendation } from "../../../contracts";
import { recommendationFromRow, recommendationToCreateData } from "../mappers";
import { prisma, type DbClient } from "../prisma";

export async function createRecommendation(
  rec: Recommendation,
  db: DbClient = prisma,
): Promise<Recommendation> {
  const row = await db.recommendation.create({
    data: recommendationToCreateData(rec),
  });
  return recommendationFromRow(row);
}

/** Newest first, served by the (disputeId, createdAt) index. id breaks ties. */
export async function getLatestRecommendation(
  disputeId: string,
  db: DbClient = prisma,
): Promise<Recommendation | null> {
  const row = await db.recommendation.findFirst({
    where: { disputeId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return row ? recommendationFromRow(row) : null;
}

export async function getRecommendation(
  id: string,
  db: DbClient = prisma,
): Promise<Recommendation | null> {
  const row = await db.recommendation.findUnique({ where: { id } });
  return row ? recommendationFromRow(row) : null;
}

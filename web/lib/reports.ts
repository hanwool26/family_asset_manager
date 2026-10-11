import type { Report } from "./types";
import { getReportsCollection } from "./mongo";
import * as mock from "./mock-reports";

// Mongo 문서 → Report 타입으로 변환 (_id, createdAt, expiresAt 등 저장용 메타 필드 제거)
function toReport(doc: Record<string, unknown>): Report {
  const { date, hour, minute, marketContext, recommendations, categorySummaries, fxAnalysis } = doc;
  return {
    date,
    hour,
    minute,
    marketContext,
    recommendations,
    categorySummaries,
    fxAnalysis: fxAnalysis ?? undefined,
  } as unknown as Report;
}

export async function listReports(): Promise<Report[]> {
  const collection = await getReportsCollection();
  if (!collection) return mock.listReports();

  const docs = await collection
    .find({})
    .sort({ date: -1, hour: -1 })
    .limit(100)
    .toArray();
  return docs.map(toReport);
}

export async function getReport(date: string, hour: number): Promise<Report | undefined> {
  const collection = await getReportsCollection();
  if (!collection) return mock.getReport(date, hour);

  const doc = await collection.findOne({ date, hour });
  return doc ? toReport(doc) : undefined;
}

export async function getLatestReport(): Promise<Report | undefined> {
  const collection = await getReportsCollection();
  if (!collection) return mock.getLatestReport();

  const doc = await collection.find({}).sort({ date: -1, hour: -1 }).limit(1).next();
  return doc ? toReport(doc) : undefined;
}

import { MemoryReportRepository } from "@/lib/server/memory-repository";
import { prisma } from "@/lib/server/prisma";
import { PrismaReportRepository } from "@/lib/server/prisma-repository";
import type { ReportRepository } from "@/lib/server/repository";

const globalForRepo = globalThis as { yetimRepo?: ReportRepository; yetimTestRepo?: ReportRepository };

export function getRepository(): ReportRepository {
  if (globalForRepo.yetimTestRepo) return globalForRepo.yetimTestRepo;
  if (!globalForRepo.yetimRepo) globalForRepo.yetimRepo = new PrismaReportRepository(prisma);
  return globalForRepo.yetimRepo;
}

export function setRepositoryForTests(repo: ReportRepository | null): void {
  globalForRepo.yetimTestRepo = repo ?? undefined;
}

export function createMemoryRepository(): MemoryReportRepository {
  return new MemoryReportRepository();
}

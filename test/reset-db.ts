import { prisma } from "@/lib/prisma";

// Call in afterEach for isolation between test cases. Order matters: children
// before parents, per the FK relations in prisma/schema.prisma.
export async function resetDb() {
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.attendanceForm.deleteMany();
  await prisma.categoryScoreRule.deleteMany();
  await prisma.overtimeScoreRule.deleteMany();
  await prisma.attendanceCategory.deleteMany();
  await prisma.complianceRating.deleteMany();
  await prisma.threeSPerformance.deleteMany();
  await prisma.sopPerformance.deleteMany();
  await prisma.person.deleteMany();
  await prisma.user.deleteMany();
}

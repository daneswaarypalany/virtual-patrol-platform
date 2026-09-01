const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
async function main() {
  const cleared = await prisma.activePatrol.deleteMany({});
  console.log("Cleared active-patrol locks:", cleared.count);
  const jobs = await prisma.patrolJob.updateMany({
    where: { status: "IN_PROGRESS" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  console.log("Closed stuck in-progress jobs:", jobs.count);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

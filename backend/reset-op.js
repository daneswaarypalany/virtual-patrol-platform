const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
async function main() {
  const hash = await bcrypt.hash("operator123", 10);
  const user = await prisma.user.update({
    where: { username: "operator1" },
    data: { passwordHash: hash, status: "ACTIVE" },
  });
  console.log("Reset done:", user.username);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

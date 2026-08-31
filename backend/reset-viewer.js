const bcrypt = require('bcrypt')
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const hash = await bcrypt.hash('viewer123', 10)
  // find the viewer by email since we know it
  const user = await prisma.user.update({
    where: { email: 'viewer01@gmail.com' },
    data: { passwordHash: hash, status: 'ACTIVE' },
  })
  console.log('Reset done. Username is:', user.username)
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1) })
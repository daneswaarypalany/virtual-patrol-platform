// ============================================================
// Virtual Patrol - Clean up all demo routes + patrol history
// Run from the backend folder:
//   node -r dotenv/config clean-routes.js
// Deletes: CheckpointResult, PatrolJob, RouteCheckpoint, Route
// Keeps:   sites, cameras, checklists, users
// ============================================================

const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Order matters: delete children before parents (foreign keys)

  const results = await prisma.checkpointResult.deleteMany({})
  console.log(`Deleted ${results.count} checkpoint result(s)`)

  const jobs = await prisma.patrolJob.deleteMany({})
  console.log(`Deleted ${jobs.count} patrol job(s)`)

  const checkpoints = await prisma.routeCheckpoint.deleteMany({})
  console.log(`Deleted ${checkpoints.count} route checkpoint(s)`)

  const routes = await prisma.route.deleteMany({})
  console.log(`Deleted ${routes.count} route(s)`)

  console.log('\nDone. Routes and patrol history cleared.')
  console.log('Sites, cameras, checklists, and users are untouched.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

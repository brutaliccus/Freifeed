import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import { getDb } from './db/db.js'
import { authenticateWithGoogleIdToken } from './auth/google.js'
import { requireAuth, sendError } from './auth/middleware.js'
import { handleSse } from './events/sse.js'
import { startHourlyBackups } from './backup.js'
import { readBabyAvatar } from './photos.js'
import { assertHouseholdMember } from './household.js'
import { registerProfileRoutes } from './routes/profile.js'
import { registerHouseholdRoutes } from './routes/household.js'
import { registerBabyRoutes } from './routes/babies.js'
import { registerFeedingRoutes } from './routes/feedings.js'
import { registerMilkRoutes } from './routes/milk.js'
import { registerDiaperRoutes } from './routes/diapers.js'
import { registerMedicineRoutes } from './routes/medicines.js'
import { registerMeasurementRoutes } from './routes/measurements.js'
import { registerNoteRoutes } from './routes/notes.js'
import { registerStubRoutes } from './routes/stubs.js'

export async function buildApp() {
  getDb()

  const app = Fastify({
    logger: true,
    bodyLimit: 6 * 1024 * 1024,
  })

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || config.corsOrigins.includes(origin)) {
        cb(null, true)
        return
      }
      cb(null, false)
    },
    credentials: true,
  })

  app.get('/api/health', async () => {
    try {
      getDb().prepare('SELECT 1').get()
      return { ok: true, version: config.version, db: 'ok' }
    } catch {
      return { ok: false, version: config.version, db: 'error' }
    }
  })

  app.post('/api/auth/google', async (request, reply) => {
    try {
      const body = (request.body ?? {}) as { idToken?: string }
      return await authenticateWithGoogleIdToken(String(body.idToken ?? ''))
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get('/api/events', async (request, reply) => {
    try {
      await handleSse(request, reply)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.get('/api/photos/households/:householdId/babies/:babyId/avatar', async (request, reply) => {
    try {
      const uid = requireAuth(request)
      const { householdId, babyId } = request.params as {
        householdId: string
        babyId: string
      }
      assertHouseholdMember(uid, householdId)
      const buf = readBabyAvatar(householdId, babyId)
      return reply.type('image/jpeg').send(buf)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  registerProfileRoutes(app)
  registerHouseholdRoutes(app)
  registerBabyRoutes(app)
  registerFeedingRoutes(app)
  registerMilkRoutes(app)
  registerDiaperRoutes(app)
  registerMedicineRoutes(app)
  registerMeasurementRoutes(app)
  registerNoteRoutes(app)
  registerStubRoutes(app)

  return app
}

async function main() {
  const app = await buildApp()
  startHourlyBackups()
  await app.listen({ port: config.port, host: config.host })
  console.log(`freifeed-api listening on ${config.host}:${config.port}`)
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') ||
    process.argv[1].endsWith('index.js') ||
    process.argv[1].includes(`${'index'}.ts`) ||
    process.argv[1].includes(`${'index'}.js`))

if (isDirectRun) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

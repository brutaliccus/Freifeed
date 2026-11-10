import type { FastifyReply, FastifyRequest } from 'fastify'
import { requireAuth } from '../auth/middleware.js'
import { getDb, parseJson } from '../db/db.js'

type Client = {
  uid: string
  reply: FastifyReply
}

const clients = new Set<Client>()

export function broadcastHouseholdEvent(householdId: string, collections: string[]) {
  const payload = JSON.stringify({
    householdId,
    collections,
    at: new Date().toISOString(),
  })
  const db = getDb()
  for (const client of clients) {
    try {
      const user = db.prepare('SELECT household_id FROM users WHERE uid = ?').get(client.uid) as
        | { household_id: string | null }
        | undefined
      let member = user?.household_id === householdId
      if (!member) {
        const h = db.prepare('SELECT members FROM households WHERE id = ?').get(householdId) as
          | { members: string }
          | undefined
        const members = parseJson<string[]>(h?.members, [])
        member = members.includes(client.uid)
      }
      if (!member) continue
      client.reply.raw.write(`data: ${payload}\n\n`)
    } catch {
      clients.delete(client)
    }
  }
}

export async function handleSse(request: FastifyRequest, reply: FastifyReply) {
  const uid = requireAuth(request)
  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': request.headers.origin ?? '*',
  })
  reply.raw.write(`data: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`)

  const client: Client = { uid, reply }
  clients.add(client)

  const heartbeat = setInterval(() => {
    try {
      reply.raw.write(`: heartbeat\n\n`)
    } catch {
      clearInterval(heartbeat)
      clients.delete(client)
    }
  }, 20_000)

  request.raw.on('close', () => {
    clearInterval(heartbeat)
    clients.delete(client)
  })
}

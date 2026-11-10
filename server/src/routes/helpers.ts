import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireAuth, sendError } from '../auth/middleware.js'
import { broadcastHouseholdEvent } from '../events/sse.js'
import { isHttpsError } from '../errors.js'

type Handler = (uid: string, body: any) => Promise<unknown> | unknown

export function registerCallable(
  app: FastifyInstance,
  name: string,
  handler: Handler,
  opts?: { collections?: (body: any) => string[]; householdId?: (body: any) => string | null },
) {
  app.post(`/api/${name}`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const uid = requireAuth(request)
      const body = (request.body ?? {}) as Record<string, unknown>
      const result = await handler(uid, body)
      if (opts?.collections) {
        const hid =
          opts.householdId?.(body) ??
          (typeof body.householdId === 'string' ? body.householdId : null)
        if (hid) broadcastHouseholdEvent(hid, opts.collections(body))
      }
      return result
    } catch (err) {
      return sendError(reply, err)
    }
  })
}

export function wrap(handler: Handler) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const uid = requireAuth(request)
      return await handler(uid, (request.body ?? {}) as Record<string, unknown>)
    } catch (err) {
      if (isHttpsError(err)) return sendError(reply, err)
      return sendError(reply, err)
    }
  }
}

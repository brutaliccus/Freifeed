import type { FastifyReply, FastifyRequest } from 'fastify'
import { HttpsError, isHttpsError } from '../errors.js'
import { verifyAuthToken } from './jwt.js'

declare module 'fastify' {
  interface FastifyRequest {
    uid?: string
  }
}

export function requireAuth(request: FastifyRequest): string {
  const header = request.headers.authorization
  let token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  // EventSource cannot set Authorization — allow access_token query for SSE.
  if (!token) {
    const q = request.query as { access_token?: string } | undefined
    token = typeof q?.access_token === 'string' ? q.access_token.trim() : ''
  }
  if (!token) throw new HttpsError('unauthenticated', 'Sign in required')
  const payload = verifyAuthToken(token)
  request.uid = payload.uid
  return payload.uid
}

export async function authPreHandler(request: FastifyRequest, _reply: FastifyReply) {
  requireAuth(request)
}

export function sendError(reply: FastifyReply, err: unknown) {
  if (isHttpsError(err)) {
    return reply.status(err.httpStatus).send(err.toJSON())
  }
  console.error(err)
  return reply.status(500).send({ error: { code: 'internal', message: 'Internal error' } })
}

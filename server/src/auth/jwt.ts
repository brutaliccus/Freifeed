import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { HttpsError } from '../errors.js'

export interface AuthTokenPayload {
  uid: string
  email?: string | null
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  })
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as AuthTokenPayload
    if (!decoded?.uid) throw new HttpsError('unauthenticated', 'Invalid token')
    return decoded
  } catch (err) {
    if (err instanceof HttpsError) throw err
    throw new HttpsError('unauthenticated', 'Invalid or expired token')
  }
}

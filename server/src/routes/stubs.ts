import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { registerCallable } from './helpers.js'

export function registerStubRoutes(app: FastifyInstance) {
  registerCallable(app, 'getAndroidAppUpdate', () => ({
    fileName: 'freifeed.apk',
    sizeBytes: null,
    releasedAt: null,
    driveModifiedTime: null,
    versionCode: null,
    versionName: null,
    downloadUrl: `${config.publicBaseUrl}/api/downloadAndroidApk`,
    releaseTag: null,
    releaseUrl: null,
    driveFileId: null,
  }))

  registerCallable(app, 'downloadAndroidApk', () => ({
    ok: false,
    message: 'APK download is not configured on the Pi backend yet',
  }))

  app.get('/api/downloadAndroidApk', async (_request, reply) => {
    return reply.status(501).send({
      error: { code: 'unimplemented', message: 'APK download stub' },
    })
  })
}

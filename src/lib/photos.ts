import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { formatApiError } from './api'
import type { BabyId } from '../types'

const MAX_DIMENSION = 960
const JPEG_QUALITY = 0.88

/** Same storage path is reused — bust browser/PWA cache after each upload. */
export function photoUrlWithCacheBust(url: string): string {
  if (url.includes('X-Goog-Signature') || url.includes('GoogleAccessId')) {
    return url
  }
  const base = url.split('?')[0]
  return `${base}?v=${Date.now()}`
}

async function fileToJpegBase64(file: File): Promise<{ base64: string; contentType: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const base64 = dataUrl.split(',')[1]
  if (!base64) throw new Error('Could not encode image')
  return { base64, contentType: 'image/jpeg' }
}

export async function uploadBabyPhoto(
  householdId: string,
  babyId: BabyId,
  file: File,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file')
  }

  const { base64, contentType } = await fileToJpegBase64(file)
  const upload = httpsCallable<
    { householdId: string; babyId: string; imageBase64: string; contentType: string },
    { photoUrl: string }
  >(functions, 'uploadBabyAvatar')

  try {
    const res = await upload({ householdId, babyId, imageBase64: base64, contentType })
    if (!res.data.photoUrl) throw new Error('Upload did not return a photo URL')
    return photoUrlWithCacheBust(res.data.photoUrl)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

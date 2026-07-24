import { useRef, useState } from 'react'
import { Camera, SkipForward } from 'lucide-react'
import { uploadBabyPhoto } from '../lib/photos'
import { updateBaby, skipPhotoOnboarding } from '../lib/household'
import { BabyAvatar } from './BabyAvatar'
import type { Baby } from '../types'

interface PhotoOnboardingProps {
  householdId: string
  uid: string
  babies: Baby[]
  onComplete: () => void | Promise<void>
}

export function PhotoOnboarding({ householdId, uid, babies, onComplete }: PhotoOnboardingProps) {
  const [index, setIndex] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const currentBaby = babies[index] ?? babies[0]
  const babyId = currentBaby?.id

  const finish = async (persistSkip: boolean) => {
    if (persistSkip) {
      await skipPhotoOnboarding(uid)
    }
    await onComplete()
  }

  const handleFile = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      if (!babyId) return
      const url = await uploadBabyPhoto(householdId, babyId, file)
      await updateBaby(householdId, babyId, { photoUrl: url })
      if (index < babies.length - 1) {
        setIndex(index + 1)
      } else {
        await finish(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload photo')
    } finally {
      setUploading(false)
    }
  }

  const skipAll = async () => {
    await finish(true)
  }

  const skipBaby = async () => {
    if (index < babies.length - 1) {
      setIndex(index + 1)
    } else {
      await finish(true)
    }
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <h2>Add a photo</h2>
        <p className="muted">
          Add a picture of {babies[index]?.name || 'your baby'} so you can tell them apart when
          logging feeds.
        </p>
        {currentBaby && <BabyAvatar baby={currentBaby} size="lg" showName />}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Camera size={18} aria-hidden />
          {uploading ? 'Uploading…' : 'Choose photo'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={skipBaby} disabled={uploading}>
          <SkipForward size={16} aria-hidden />
          Skip for now
        </button>
        <button type="button" className="btn btn-ghost btn--subtle" onClick={skipAll} disabled={uploading}>
          Don&apos;t ask again
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  )
}

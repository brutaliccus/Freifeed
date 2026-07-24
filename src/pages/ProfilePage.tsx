import { useEffect, useRef, useState } from 'react'
import { LogOut, Pencil, Plus, Trash2 } from 'lucide-react'
import { AppBrand } from '../components/AppBrand'
import { ConfirmDeleteBabyModal } from '../components/ConfirmDeleteBabyModal'
import { BabyAvatar } from '../components/BabyAvatar'
import { DatePickerField } from '../components/DatePickerField'
import { FeedNotificationSettings } from '../components/FeedNotificationSettings'
import { FeedReminderSettings } from '../components/FeedReminderSettings'
import { MedicineNotificationSettings } from '../components/MedicineNotificationSettings'
import { MedicineOverdueNotificationSettings } from '../components/MedicineOverdueNotificationSettings'
import { BannerNotificationSettings } from '../components/BannerNotificationSettings'
import { NursingSessionReminderSettings } from '../components/NursingSessionReminderSettings'
import { HouseholdManagementPanel } from '../components/HouseholdManagementPanel'
import { HouseholdInviteCodeSection } from '../components/HouseholdInviteCodeSection'
import { HouseholdExportSection } from '../components/HouseholdExportSection'
import { ApplicationSettings } from '../components/ApplicationSettings'
import { BabyTrackerSettings } from '../components/BabyTrackerSettings'
import { usesNativeNotifications } from '../lib/notificationPlatform'
import { BABY_BORDER_COLORS, resolveBabyBorderColor, type BabyBorderColorId } from '../lib/babyBorderColors'
import { uploadBabyPhoto } from '../lib/photos'
import { addBaby, deleteBaby, updateBaby } from '../lib/household'
import { formatBirthHeightIn, formatLbOz } from '../lib/weight'
import type { Baby, Household, Feeding, UserProfile } from '../types'
import type { ActiveFeedDraft } from '../lib/activeFeedSession'

type ProfileTab = 'babies' | 'notifications' | 'household' | 'application'

interface ProfilePageProps {
  household: Household | null
  babies: Baby[]
  householdId: string
  currentUid: string | null
  feedings: Feeding[]
  localSessions: ActiveFeedDraft[]
  onBabyUpdated: () => void
  onHouseholdRefresh?: () => void
  onLeftHousehold?: () => void
  onSignOut: () => void
  onNotificationsEnabledChange: (enabled: boolean) => void
  onMedicineNotificationsEnabledChange?: (enabled: boolean) => void
  onMedicineOverdueFollowupsChange?: () => void
  profile: UserProfile | null
  onProfileUpdated: () => void
  /** When set, switches to this tab once (e.g. from update banner). */
  requestedTab?: ProfileTab | null
  onRequestedTabHandled?: () => void
}

const PROFILE_TABS: { id: ProfileTab; label: string }[] = [
  { id: 'babies', label: 'Babies' },
  { id: 'notifications', label: 'Alerts' },
  { id: 'household', label: 'Household' },
  { id: 'application', label: 'App' },
]

export function ProfilePage({
  household,
  babies,
  householdId,
  currentUid,
  feedings,
  localSessions,
  onBabyUpdated,
  onHouseholdRefresh,
  onLeftHousehold,
  onSignOut,
  onNotificationsEnabledChange,
  onMedicineNotificationsEnabledChange,
  onMedicineOverdueFollowupsChange,
  profile,
  onProfileUpdated,
  requestedTab,
  onRequestedTabHandled,
}: ProfilePageProps) {
  const [tab, setTab] = useState<ProfileTab>('babies')
  const [newBabyName, setNewBabyName] = useState('')
  const [addingBaby, setAddingBaby] = useState(false)

  useEffect(() => {
    if (!requestedTab) return
    setTab(requestedTab)
    onRequestedTabHandled?.()
  }, [requestedTab, onRequestedTabHandled])

  return (
    <div className="page profile-page">
      <header className="page__header">
        <AppBrand />
      </header>

      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        {PROFILE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`profile-tabs__btn${tab === t.id ? ' profile-tabs__btn--active' : ''}`}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'babies' && (
        <div role="tabpanel" className="profile-tab-panel">
          <section className="profile-section">
            <h2>Add baby</h2>
            <div className="inline-row">
              <input
                type="text"
                className="input"
                value={newBabyName}
                maxLength={40}
                placeholder="Baby name"
                disabled={addingBaby}
                onChange={(e) => setNewBabyName(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={addingBaby || !newBabyName.trim()}
                onClick={() => {
                  void (async () => {
                    setAddingBaby(true)
                    try {
                      await addBaby(householdId, newBabyName.trim())
                      setNewBabyName('')
                      onBabyUpdated()
                    } finally {
                      setAddingBaby(false)
                    }
                  })()
                }}
              >
                <Plus size={16} aria-hidden />
                Add
              </button>
            </div>
          </section>
          {babies.map((baby) => (
            <BabyProfileEditor
              key={baby.id}
              baby={baby}
              householdId={householdId}
              onUpdated={onBabyUpdated}
            />
          ))}
        </div>
      )}

      {tab === 'notifications' && (
        <div role="tabpanel" className="profile-tab-panel">
          <p
            className={`profile-notifications-disclaimer${usesNativeNotifications() ? '' : ' profile-notifications-disclaimer--web'}`}
            role="note"
          >
            {usesNativeNotifications()
              ? 'These alerts use Android system notifications.'
              : 'Notifications only work in the Freifeed Android app — not in the browser. Install the app from Profile → App.'}
          </p>
          <BannerNotificationSettings />
          <FeedNotificationSettings onEnabledChange={onNotificationsEnabledChange} />
          <NursingSessionReminderSettings
            feedings={feedings}
            babies={babies}
            localSessions={localSessions}
          />
          <FeedReminderSettings feedings={feedings} babies={babies} localSessions={localSessions} />
          <MedicineNotificationSettings
            onEnabledChange={onMedicineNotificationsEnabledChange ?? (() => {})}
          />
          <MedicineOverdueNotificationSettings
            onEnabledChange={onMedicineOverdueFollowupsChange ?? (() => {})}
          />
        </div>
      )}

      {tab === 'application' && (
        <div role="tabpanel" className="profile-tab-panel">
          <ApplicationSettings profile={profile} onProfileUpdated={onProfileUpdated} />
        </div>
      )}

      {tab === 'household' && (
        <div role="tabpanel" className="profile-tab-panel">
          {household ? (
            <>
              <HouseholdInviteCodeSection
                household={household}
                householdId={householdId}
                currentUid={currentUid}
                onRefresh={() => onHouseholdRefresh?.()}
              />

              <HouseholdManagementPanel
                household={household}
                householdId={householdId}
                currentUid={currentUid}
                onRefresh={() => onHouseholdRefresh?.()}
                onLeftHousehold={() => onLeftHousehold?.()}
              />

              <HouseholdExportSection householdId={householdId} />
            </>
          ) : (
            <p className="muted">Household details are loading…</p>
          )}
        </div>
      )}

      <button type="button" className="btn btn-ghost sign-out-btn" onClick={onSignOut}>
        <LogOut size={18} aria-hidden />
        Sign out
      </button>
    </div>
  )
}

function hasSavedBirthMeta(baby: Baby): boolean {
  return (
    baby.birthDate != null ||
    baby.birthWeightLb != null ||
    baby.birthWeightOz != null ||
    baby.birthHeightIn != null
  )
}

function formatBirthDateDisplay(value: string | null): string {
  if (!value) return '—'
  const day = value.trim().slice(0, 10)
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return value
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function BabyProfileEditor({
  baby,
  householdId,
  onUpdated,
}: {
  baby: Baby
  householdId: string
  onUpdated: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const locked = hasSavedBirthMeta(baby)
  const [editing, setEditing] = useState(!locked)
  const [birthDate, setBirthDate] = useState(baby.birthDate ?? '')
  const [name, setName] = useState(baby.name ?? '')
  const [birthLb, setBirthLb] = useState(baby.birthWeightLb != null ? String(baby.birthWeightLb) : '')
  const [birthOz, setBirthOz] = useState(baby.birthWeightOz != null ? String(baby.birthWeightOz) : '')
  const [birthHeightIn, setBirthHeightIn] = useState(
    baby.birthHeightIn != null ? String(baby.birthHeightIn) : '',
  )
  const [sex, setSex] = useState<'male' | 'female' | ''>(baby.sex ?? '')
  const [borderColorId, setBorderColorId] = useState(baby.borderColorId)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Baby | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    setBorderColorId(baby.borderColorId)
  }, [baby.borderColorId])

  useEffect(() => {
    if (!editing) {
      setBirthDate(baby.birthDate ?? '')
      setName(baby.name ?? '')
      setBirthLb(baby.birthWeightLb != null ? String(baby.birthWeightLb) : '')
      setBirthOz(baby.birthWeightOz != null ? String(baby.birthWeightOz) : '')
      setBirthHeightIn(baby.birthHeightIn != null ? String(baby.birthHeightIn) : '')
      setSex(baby.sex ?? '')
      setDirty(false)
    }
  }, [baby, editing])

  useEffect(() => {
    if (!locked) setEditing(true)
  }, [locked])

  const saveMeta = async () => {
    setSaving(true)
    try {
      await updateBaby(householdId, baby.id, {
        name: name.trim() || baby.name,
        birthDate: birthDate || null,
        birthWeightLb: birthLb === '' ? null : Number(birthLb),
        birthWeightOz: birthOz === '' ? null : Number(birthOz),
        birthHeightIn: birthHeightIn === '' ? null : Number(birthHeightIn),
        sex: sex === 'male' || sex === 'female' ? sex : null,
      })
      onUpdated()
      if (hasSavedBirthMeta({
        ...baby,
        name: name.trim() || baby.name,
        birthDate: birthDate || null,
        birthWeightLb: birthLb === '' ? null : Number(birthLb),
        birthWeightOz: birthOz === '' ? null : Number(birthOz),
        birthHeightIn: birthHeightIn === '' ? null : Number(birthHeightIn),
      })) {
        setEditing(false)
      }
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const toggleEditing = async () => {
    if (editing) {
      if (dirty) await saveMeta()
      else setEditing(false)
    } else {
      setEditing(true)
    }
  }

  const activeBorderId = borderColorId ?? resolveBabyBorderColor(baby).id
  const fieldsEditable = !locked || editing

  const saveBorderColor = async (id: BabyBorderColorId) => {
    setBorderColorId(id)
    setSaving(true)
    try {
      await updateBaby(householdId, baby.id, { borderColorId: id })
      onUpdated()
      setDirty(true)
    } finally {
      setSaving(false)
    }
  }

  const handlePhoto = async (file: File) => {
    setSaving(true)
    setPhotoError(null)
    try {
      const url = await uploadBabyPhoto(householdId, baby.id, file)
      await updateBaby(householdId, baby.id, { photoUrl: url })
      onUpdated()
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Could not upload photo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={`profile-section baby-profile${editing ? ' baby-profile--editing' : ''}`}>
      <div className="baby-profile__header">
        <h2 className="baby-profile__title">{baby.name}</h2>
        {locked && (
          <button
            type="button"
            className={`icon-btn baby-profile__edit-btn${editing ? ' baby-profile__edit-btn--active' : ''}`}
            onClick={() => void toggleEditing()}
            aria-label={editing ? `Done editing ${baby.name}` : `Edit ${baby.name}`}
            aria-pressed={editing}
          >
            <Pencil size={18} aria-hidden />
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handlePhoto(f)
          e.target.value = ''
        }}
      />
      <div className="baby-profile__avatar">
        <BabyAvatar
          baby={baby}
          size="lg"
          onClick={fieldsEditable ? () => fileRef.current?.click() : undefined}
        />
        {fieldsEditable && <span className="baby-profile__avatar-hint muted">Tap photo to change</span>}
      </div>
      {photoError && <p className="error-text">{photoError}</p>}

      <label className="field baby-profile__field">
        <span className="field-label">Name</span>
        <input
          type="text"
          className="input"
          maxLength={40}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setDirty(true)
          }}
          disabled={saving}
        />
      </label>

      <div className="baby-border-picker">
        <span className="field-label">Photo border color</span>
        <div className="baby-border-picker__swatches" role="listbox" aria-label={`${baby.name} border color`}>
          {BABY_BORDER_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              role="option"
              aria-selected={activeBorderId === color.id}
              className={`baby-border-swatch${activeBorderId === color.id ? ' baby-border-swatch--selected' : ''}`}
              style={{ background: color.border }}
              onClick={() => saveBorderColor(color.id)}
              disabled={saving}
              title={color.label}
              aria-label={color.label}
            />
          ))}
        </div>
      </div>

      {fieldsEditable ? (
        <>
          <DatePickerField
            label="Birthdate"
            value={birthDate}
            onChange={(next) => {
              setBirthDate(next)
              setDirty(true)
            }}
            className="input"
          />

          <div className="field baby-profile__field">
            <span className="field-label">Birth weight</span>
            <div className="weight-fields__row">
              <input
                type="number"
                className="input input--small"
                placeholder="lb"
                min={0}
                value={birthLb}
                onChange={(e) => {
                  setBirthLb(e.target.value)
                  setDirty(true)
                }}
              />
              <input
                type="number"
                className="input input--small"
                placeholder="oz"
                min={0}
                max={15}
                value={birthOz}
                onChange={(e) => {
                  setBirthOz(e.target.value)
                  setDirty(true)
                }}
              />
            </div>
          </div>

          <label className="field baby-profile__field">
            <span className="field-label">Sex (for growth percentiles)</span>
            <select
              className="input"
              value={sex}
              onChange={(e) => {
                setSex(e.target.value as 'male' | 'female' | '')
                setDirty(true)
              }}
            >
              <option value="">Not set</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </label>

          <label className="field baby-profile__field">
            <span className="field-label">Birth height (in)</span>
            <input
              type="number"
              className="input"
              placeholder="in"
              min={0}
              step="any"
              inputMode="decimal"
              value={birthHeightIn}
              onChange={(e) => {
                setBirthHeightIn(e.target.value)
                setDirty(true)
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary baby-profile__save-btn"
            onClick={() => void saveMeta()}
            disabled={saving || !dirty}
          >
            Save changes
          </button>
        </>
      ) : (
        <dl className="baby-profile__readout">
          <div className="baby-profile__readout-row">
            <dt>Birthdate</dt>
            <dd>{formatBirthDateDisplay(baby.birthDate)}</dd>
          </div>
          <div className="baby-profile__readout-row">
            <dt>Birth weight</dt>
            <dd>{formatLbOz(baby.birthWeightLb, baby.birthWeightOz) || '—'}</dd>
          </div>
          <div className="baby-profile__readout-row">
            <dt>Sex</dt>
            <dd>{baby.sex === 'male' ? 'Male' : baby.sex === 'female' ? 'Female' : '—'}</dd>
          </div>
          <div className="baby-profile__readout-row">
            <dt>Birth height</dt>
            <dd>{formatBirthHeightIn(baby.birthHeightIn) || '—'}</dd>
          </div>
        </dl>
      )}

      <BabyTrackerSettings baby={baby} householdId={householdId} onUpdated={onUpdated} />

      {saving && <p className="muted">Saving…</p>}
      <button
        type="button"
        className="btn btn-ghost baby-profile__delete-btn"
        disabled={saving}
        onClick={() => {
          setDeleteError(null)
          setDeleteTarget(baby)
        }}
      >
        <Trash2 size={16} aria-hidden />
        Delete baby
      </button>
      <ConfirmDeleteBabyModal
        babyName={deleteTarget?.name ?? 'this baby'}
        open={deleteTarget != null}
        busy={saving}
        error={deleteError}
        onCancel={() => {
          if (!saving) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
        onConfirm={() => {
          if (!deleteTarget) return
          void (async () => {
            setDeleteError(null)
            setSaving(true)
            try {
              await deleteBaby(householdId, deleteTarget.id)
              setDeleteTarget(null)
              onUpdated()
            } catch (e) {
              setDeleteError(e instanceof Error ? e.message : 'Could not delete baby')
            } finally {
              setSaving(false)
            }
          })()
        }}
      />
    </section>
  )
}

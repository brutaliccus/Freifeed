import {
  apiGetUserProfile,
  apiUpsertUserProfile,
  apiCreateHousehold,
  apiJoinHousehold,
  apiGetHousehold,
  apiSetPersonNickname,
  apiSetMemberShowOnHome,
  apiSkipPhotoOnboarding,
  apiSkipBabyOnboarding,
  apiAddBaby,
  apiDeleteBaby,
  apiGetBabies,
  apiUpdateBaby,
  apiUpdateNavTrackers,
  apiUpdateAppSettings,
  formatApiError,
} from './api'
import type {
  Baby,
  BabyId,
  HomePrimaryAction,
  Household,
  TrackerVisibility,
  UserProfile,
  AppThemeId,
} from '../types'

export async function getUserProfile(_uid: string): Promise<UserProfile | null> {
  return apiGetUserProfile()
}

export async function upsertUserProfile(
  _uid: string,
  data: Partial<Pick<UserProfile, 'email' | 'displayName' | 'photoURL'>>,
): Promise<void> {
  await apiUpsertUserProfile(data)
}

export async function createHousehold(_uid: string): Promise<{ householdId: string; inviteCode: string }> {
  try {
    return await apiCreateHousehold()
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function joinHousehold(_uid: string, code: string): Promise<string> {
  try {
    return await apiJoinHousehold(code)
  } catch (err) {
    const msg = formatApiError(err)
    if (msg.includes('Invalid invite') || msg.includes('not-found')) {
      throw new Error(msg.includes('Invalid') ? 'Invalid invite code' : 'Household not found')
    }
    throw new Error(msg)
  }
}

export async function getHousehold(householdId: string): Promise<Household | null> {
  return apiGetHousehold(householdId)
}

export async function setPersonNickname(
  householdId: string,
  personId: string,
  nickname: string,
): Promise<void> {
  try {
    await apiSetPersonNickname(householdId, personId, nickname)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function setMemberShowOnHome(
  householdId: string,
  memberUid: string,
  showOnHome: boolean,
): Promise<void> {
  try {
    await apiSetMemberShowOnHome(householdId, memberUid, showOnHome)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function skipPhotoOnboarding(_uid: string): Promise<void> {
  await apiSkipPhotoOnboarding()
}

export async function skipBabyOnboarding(_uid: string): Promise<void> {
  await apiSkipBabyOnboarding()
}

export async function addBaby(householdId: string, name: string): Promise<string> {
  return apiAddBaby(householdId, name)
}

export async function deleteBaby(householdId: string, babyId: BabyId): Promise<void> {
  await apiDeleteBaby(householdId, babyId)
}

export async function getBabies(householdId: string): Promise<Baby[]> {
  return apiGetBabies(householdId)
}

export async function updateBaby(
  householdId: string,
  babyId: BabyId,
  data: Partial<Omit<Baby, 'id'>>,
): Promise<void> {
  await apiUpdateBaby(householdId, babyId, data)
}

export function babiesNeedPhotos(babies: Baby[]): boolean {
  return babies.some((b) => !b.photoUrl)
}

export async function updateNavTrackers(navTrackers: TrackerVisibility): Promise<void> {
  try {
    await apiUpdateNavTrackers(navTrackers)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

export async function updateAppSettings(data: {
  navTrackers?: TrackerVisibility
  homePrimaryAction?: HomePrimaryAction
  uiScale?: number
  appTheme?: AppThemeId
}): Promise<void> {
  try {
    await apiUpdateAppSettings(data)
  } catch (err) {
    throw new Error(formatApiError(err))
  }
}

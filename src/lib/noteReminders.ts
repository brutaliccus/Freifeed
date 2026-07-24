/** Minutes before appointment to fire a reminder notification. */
export const APPOINTMENT_REMINDER_OPTIONS = [
  { minutes: 5, label: '5 minutes before' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 45, label: '45 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 180, label: '3 hours before' },
  { minutes: 360, label: '6 hours before' },
  { minutes: 720, label: '12 hours before' },
  { minutes: 1440, label: '1 day before' },
] as const

export function reminderLabel(minutes: number): string {
  return APPOINTMENT_REMINDER_OPTIONS.find((o) => o.minutes === minutes)?.label ?? `${minutes} min before`
}

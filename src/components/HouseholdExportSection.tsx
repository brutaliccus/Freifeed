import { useState } from 'react'
import { Download } from 'lucide-react'
import { apiExportHouseholdData, formatApiError } from '../lib/api'
import { downloadTextFile, formatExportAsText, type ExportPayload } from '../lib/exportData'

interface HouseholdExportSectionProps {
  householdId: string
}

export function HouseholdExportSection({ householdId }: HouseholdExportSectionProps) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleExport = async () => {
    setError(null)
    setSuccess(null)
    setExporting(true)
    try {
      const raw = await apiExportHouseholdData(householdId)
      const data = raw as unknown as ExportPayload
      const text = formatExportAsText(data)
      const stamp = new Date().toISOString().slice(0, 10)
      await downloadTextFile(`freifeed-backup-${stamp}.txt`, text)
      setSuccess('Export ready — check your downloads or share sheet.')
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="profile-section profile-section--household-export">
      <h2>Export data</h2>
      <p className="muted">Download a text backup of feedings, diapers, milk, and medicines.</p>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={exporting}
        onClick={() => void handleExport()}
      >
        <Download size={16} aria-hidden />
        {exporting ? 'Preparing export…' : 'Export data'}
      </button>
      {success && <p className="muted household-export-success">{success}</p>}
      {error && <p className="error-text">{error}</p>}
    </section>
  )
}

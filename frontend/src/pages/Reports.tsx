import { useEffect, useState } from "react"
import { FileText, Download, Eye } from "lucide-react"
import type { PatrolJobSummary } from "../lib/patrol"
import { patrolApi } from "../lib/patrol"
import "./Reports.css"

export default function Reports() {
  const [jobs, setJobs] = useState<PatrolJobSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")

  useEffect(() => {
    patrolApi.listJobs().then(setJobs).catch(() => setError("Failed to load reports")).finally(() => setLoading(false))
  }, [])

  const completed = jobs.filter((j) => j.status === "COMPLETED")
  const filtered = completed.filter((j) => {
    const q = search.toLowerCase()
    return j.route.name.toLowerCase().includes(q) || j.route.site.name.toLowerCase().includes(q) || j.operator.fullName.toLowerCase().includes(q)
  })

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : "-")
  const openReport = (jobId: string) => { window.open(patrolApi.reportUrl(jobId), "_blank") }

  return (
    <div className="reports-page">
      <div className="reports-toolbar">
        <input className="reports-search" placeholder="Search reports..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <p className="reports-count">{filtered.length} reports</p>
      </div>

      {error && <div className="reports-error">{error}</div>}

      {loading ? (
        <p className="reports-loading">Loading...</p>
      ) : completed.length === 0 ? (
        <div className="reports-empty"><FileText size={40} className="reports-empty-icon" /><p>No completed patrols yet.</p></div>
      ) : filtered.length === 0 ? (
        <div className="reports-empty"><p>No reports match your search.</p></div>
      ) : (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr><th>Route</th><th>Site</th><th>Operator</th><th>Completed</th><th>Checkpoints</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((j) => (
                <tr key={j.id}>
                  <td className="report-route">{j.route.name}</td>
                  <td>{j.route.site.name}</td>
                  <td>{j.operator.fullName}</td>
                  <td>{fmt(j.completedAt)}</td>
                  <td>{j._count.results}</td>
                  <td className="report-actions">
                    <button onClick={() => openReport(j.id)}><Eye size={14} /> View</button>
                    <a href={patrolApi.reportUrl(j.id)} download className="report-download"><Download size={14} /> PDF</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

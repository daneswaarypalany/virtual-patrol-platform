import { useState } from 'react'
import { Settings as SettingsIcon, Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext'
import type { ThemeMode } from '../theme/ThemeContext'
import './Settings.css'

interface SettingsForm {
  orgName: string
  orgContactEmail: string
  orgPhone: string
  timezone: string
  dateFormat: string
  timeFormat: string
  notifyIssues: boolean
  notifyCompleted: boolean
  notifyOffline: boolean
}

const DEFAULTS: SettingsForm = {
  orgName: 'A-Force Protection Pte. Ltd.',
  orgContactEmail: 'ops@aforce.example',
  orgPhone: '+65 6000 0000',
  timezone: 'Asia/Singapore',
  dateFormat: 'DD MMM YYYY',
  timeFormat: '24h',
  notifyIssues: true,
  notifyCompleted: true,
  notifyOffline: false,
}

export default function Settings() {
  const [form, setForm] = useState<SettingsForm>(DEFAULTS)
  const [saved, setSaved] = useState<SettingsForm>(DEFAULTS)
  const [savedFlash, setSavedFlash] = useState(false)
  const { mode, setMode } = useTheme()

  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = () => {
    setSaved(form)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2500)
  }

  const cancel = () => setForm(saved)

  return (
    <div className="settings-page">
      <div className="settings-hero">
        <div className="settings-hero-icon">
          <SettingsIcon size={24} />
        </div>
        <div>
          <h2>General Settings</h2>
          <p>System-wide configuration for the Virtual Patrol platform.</p>
        </div>
      </div>

      <div className="settings-form">
        {/* Organization */}
        <section className="settings-section">
          <div className="section-head">
            <h3>Organization Information</h3>
            <p>Details shown on reports and across the platform.</p>
          </div>
          <div className="section-body">
            <div className="field">
              <label>Organization name</label>
              <input
                value={form.orgName}
                onChange={(e) => set('orgName', e.target.value)}
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Contact email</label>
                <input
                  value={form.orgContactEmail}
                  onChange={(e) => set('orgContactEmail', e.target.value)}
                />
              </div>
              <div className="field">
                <label>Contact phone</label>
                <input
                  value={form.orgPhone}
                  onChange={(e) => set('orgPhone', e.target.value)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section className="settings-section">
          <div className="section-head">
            <h3>Appearance</h3>
            <p>Choose how the Virtual Patrol platform looks on this device.</p>
          </div>
          <div className="section-body">
            <div className="theme-switch" role="radiogroup" aria-label="Theme">
              {(
                [
                  { value: 'light' as ThemeMode, label: 'Light', icon: Sun },
                  { value: 'dark' as ThemeMode, label: 'Dark', icon: Moon },
                  { value: 'system' as ThemeMode, label: 'System', icon: Monitor },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  className={`theme-option ${mode === value ? 'is-active' : ''}`}
                  onClick={() => setMode(value)}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Regional */}
        <section className="settings-section">
          <div className="section-head">
            <h3>Regional Preferences</h3>
            <p>Timezone and formatting applied across the app.</p>
          </div>
          <div className="section-body">
            <div className="field-row">
              <div className="field">
                <label>Timezone</label>
                <select
                  value={form.timezone}
                  onChange={(e) => set('timezone', e.target.value)}
                >
                  <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                  <option value="Asia/Kuala_Lumpur">Asia/Kuala Lumpur (GMT+8)</option>
                  <option value="Asia/Jakarta">Asia/Jakarta (GMT+7)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
              <div className="field">
                <label>Date format</label>
                <select
                  value={form.dateFormat}
                  onChange={(e) => set('dateFormat', e.target.value)}
                >
                  <option value="DD MMM YYYY">DD MMM YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>
              <div className="field">
                <label>Time format</label>
                <select
                  value={form.timeFormat}
                  onChange={(e) => set('timeFormat', e.target.value)}
                >
                  <option value="24h">24-hour</option>
                  <option value="12h">12-hour</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="settings-section">
          <div className="section-head">
            <h3>General Notifications</h3>
            <p>Choose which events generate alerts.</p>
          </div>
          <div className="section-body">
            {[
              {
                key: 'notifyIssues' as const,
                label: 'Flagged issues',
                desc: 'Notify when an operator flags an issue during a patrol.',
              },
              {
                key: 'notifyCompleted' as const,
                label: 'Completed patrols',
                desc: 'Notify when a patrol is completed.',
              },
              {
                key: 'notifyOffline' as const,
                label: 'Camera offline',
                desc: 'Notify when a camera stream goes offline.',
              },
            ].map((n) => (
              <div key={n.key} className="toggle-row">
                <div>
                  <strong>{n.label}</strong>
                  <span>{n.desc}</span>
                </div>
                <button
                  type="button"
                  className={`toggle ${form[n.key] ? 'on' : ''}`}
                  onClick={() => set(n.key, !form[n.key])}
                  aria-pressed={form[n.key]}
                >
                  <span className="toggle-knob" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Save / cancel action bar */}
      <div className={`settings-actionbar ${dirty ? 'show' : ''}`}>
        <span className="actionbar-status">
          {dirty ? (
            <>
              <span className="dot-unsaved" /> Unsaved changes
            </>
          ) : savedFlash ? (
            <>
              <span className="dot-saved" /> All changes saved
            </>
          ) : (
            ''
          )}
        </span>
        <div className="actionbar-buttons">
          <button className="btn-secondary" onClick={cancel} disabled={!dirty}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={!dirty}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
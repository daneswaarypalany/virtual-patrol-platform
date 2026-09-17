import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import SearchableSelect from './SearchableSelect'
import TimeWheelPicker from './TimeWheelPicker'
import {
  DATE_PRESETS,
  SHIFTS,
  type ReportFilters,
  type SortKey,
} from '../hooks/useReportFilters'

export default function ReportsFilterBar({
  f,
  searchPlaceholder = 'Search by route, site, or operator…',
  countLabel,
  showSort = true,
}: {
  f: ReportFilters
  searchPlaceholder?: string
  countLabel: string
  showSort?: boolean
}) {
  return (
    <>
      <div className="reports-toolbar">
        <input
          className="reports-search"
          placeholder={searchPlaceholder}
          value={f.search}
          onChange={(e) => f.setSearch(e.target.value)}
        />
        <div className="toolbar-right">
          <p className="reports-count">{countLabel}</p>
        </div>
      </div>

      <div className="reports-controls-row">
        <div className="date-presets-wrap" ref={f.panelWrapRef}>
          <div className="date-presets">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                className={f.datePreset === p.key ? 'active' : ''}
                onClick={() => f.selectPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {f.panelOpen && (
            <div className="custom-range-panel">
              {f.datePreset !== 'today' && (
                <>
                  <div className="range-section">
                    <span className="range-title">Date range</span>
                    <div className="date-range-field">
                      <label>From</label>
                      <DatePicker
                        selected={f.fromDate}
                        onChange={f.handleFromDateChange}
                        selectsStart
                        startDate={f.fromDate}
                        endDate={f.toDate}
                        placeholderText="Start date"
                        dateFormat="dd MMM yyyy"
                        className="range-input"
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                      />
                    </div>
                    <div className="date-range-field">
                      <label>
                        To
                        {(f.datePreset === 'week' ||
                          f.datePreset === 'month' ||
                          f.datePreset === 'year') && (
                          <span className="range-auto-hint"> (auto)</span>
                        )}
                      </label>
                      <DatePicker
                        selected={f.toDate}
                        onChange={(d) => f.setToDate(d)}
                        selectsEnd
                        startDate={f.fromDate}
                        endDate={f.toDate}
                        minDate={f.fromDate ?? undefined}
                        placeholderText="End date"
                        dateFormat="dd MMM yyyy"
                        className="range-input"
                        showMonthDropdown
                        showYearDropdown
                        dropdownMode="select"
                      />
                    </div>
                  </div>

                  <div className="range-divider" />
                </>
              )}

              <div className="range-section">
                <span className="range-title">Time of day</span>
                <div className="date-range-field">
                  <label>From</label>
                  <TimeWheelPicker value={f.fromTime} onChange={f.setFromTime} />
                </div>
                <div className="date-range-field">
                  <label>To</label>
                  <TimeWheelPicker value={f.toTime} onChange={f.setToTime} />
                </div>
              </div>

              <div className="range-divider" />

              <div className="range-section">
                <span className="range-title">Shift</span>
                <div className="shift-buttons">
                  {SHIFTS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={
                        f.fromTime === s.from && f.toTime === s.to ? 'active' : ''
                      }
                      onClick={() => {
                        f.setFromTime(s.from)
                        f.setToTime(s.to)
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="range-panel-actions">
                {(f.fromDate || f.toDate || f.fromTime || f.toTime) && (
                  <button
                    className="range-clear"
                    onClick={() => {
                      f.handleFromDateChange(null)
                      f.setToDate(null)
                      f.setFromTime('')
                      f.setToTime('')
                    }}
                  >
                    Clear all
                  </button>
                )}
                <button
                  className="range-cancel"
                  onClick={() => f.setPanelOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="range-select"
                  onClick={() => f.setPanelOpen(false)}
                >
                  Select
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="reports-filters">
          <div className="filter-selects">
            <div className="filter-select-w">
              <SearchableSelect
                value={f.siteFilter}
                onChange={(v) => f.setSiteFilter(v)}
                placeholder="All sites"
                options={[
                  { value: 'all', label: 'All sites' },
                  ...f.sites.map((s) => ({ value: s, label: s })),
                ]}
              />
            </div>

            {showSort && (
              <div className="filter-select-w">
                <SearchableSelect
                  value={f.sortKey}
                  onChange={(v) => f.setSortKey(v as SortKey)}
                  placeholder="Sort"
                  searchable={false}
                  options={[
                    { value: 'newest', label: 'Newest first' },
                    { value: 'oldest', label: 'Oldest first' },
                    { value: 'site', label: 'By site' },
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
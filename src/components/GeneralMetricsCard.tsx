import { memo } from 'react'
import type { GeneralMetrics } from '../types/messages'

type GeneralMetricsCardProps = {
  metrics: GeneralMetrics | null
}

const formatWithPrecision = (value: string | null, digits: number) => {
  if (!value) {
    return '—'
  }
  const numeric = parseFloat(value.replace(/[^0-9+\-.]/g, ''))
  if (Number.isNaN(numeric)) {
    return value
  }
  const unit = value.replace(/[0-9+\-.]/g, '').trim()
  return `${numeric.toFixed(digits)}${unit}`
}

const GeneralMetricsCard = memo(function GeneralMetricsCard({ metrics }: GeneralMetricsCardProps) {
  if (!metrics) {
    return null
  }

  return (
    <div className="general-metrics">
      <div className="metric-main">
        <div className="metric-highlight">
          <span className="label">电压</span>
          <span className="value">{metrics.voltage.toFixed(6)}</span>
          <span className="unit">V</span>
          <div className="metric-bar">
            <div
              className="metric-bar-fill"
              style={{ width: `${Math.min((metrics.voltage / 30) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div className="metric-highlight">
          <span className="label">电流</span>
          <span className="value">{metrics.current.toFixed(6)}</span>
          <span className="unit">A</span>
          <div className="metric-bar alt">
            <div
              className="metric-bar-fill"
              style={{ width: `${Math.min((metrics.current / 5) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div className="metric-highlight">
          <span className="label">功率</span>
          <span className="value">{metrics.power.toFixed(6)}</span>
          <span className="unit">W</span>
          <div className="metric-bar power">
            <div
              className="metric-bar-fill"
              style={{ width: `${Math.min((metrics.power / 150) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="metric-grid">
        {metrics.temperature !== null && (
          <div>
            <span>温度</span>
            <strong>{metrics.temperature.toFixed(3)}°C</strong>
          </div>
        )}
        {metrics.ah && (
          <div>
            <span>累积电量</span>
            <strong>{formatWithPrecision(metrics.ah, 3)}</strong>
          </div>
        )}
        {metrics.wh && (
          <div>
            <span>累积能量</span>
            <strong>{formatWithPrecision(metrics.wh, 3)}</strong>
          </div>
        )}
        {metrics.rectime && (
          <div>
            <span>记录时长</span>
            <strong>{metrics.rectime}</strong>
          </div>
        )}
        {metrics.runtime && (
          <div>
            <span>运行时长</span>
            <strong>{metrics.runtime}</strong>
          </div>
        )}
        {metrics.dp && (
          <div>
            <span>D+</span>
            <strong>{formatWithPrecision(metrics.dp, 3)}</strong>
          </div>
        )}
        {metrics.dn && (
          <div>
            <span>D-</span>
            <strong>{formatWithPrecision(metrics.dn, 3)}</strong>
          </div>
        )}
        {metrics.cc1 && (
          <div>
            <span>CC1</span>
            <strong>{formatWithPrecision(metrics.cc1, 3)}</strong>
          </div>
        )}
        {metrics.cc2 && (
          <div>
            <span>CC2</span>
            <strong>{formatWithPrecision(metrics.cc2, 3)}</strong>
          </div>
        )}
        {metrics.group && (
          <div>
            <span>分组</span>
            <strong>{metrics.group}</strong>
          </div>
        )}
      </div>
    </div>
  )
})

export default GeneralMetricsCard

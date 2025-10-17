import { memo, useMemo } from 'react'
import type { HidReport } from '../hooks/useWebHID'

type StatusBarProps = {
  pyStatus: string
  heroStatus: string
  hidStatus: string
  hidConnectionLabel: string
  hidConnected: boolean
  hidSupported: boolean
  hidError: Error | null
  details: {
    productName?: string | null
    vendorId?: number
    productId?: number
    opened: boolean
  }
  latestReport: HidReport | null
  showDetails: boolean
  onToggleDetails: () => void
  onConnect: () => void
  onDisconnect: () => void
  isRunning: boolean
}

const StatusBar = memo(function StatusBar({
  pyStatus,
  heroStatus,
  hidStatus,
  hidConnectionLabel,
  hidConnected,
  hidSupported,
  hidError,
  details,
  latestReport,
  showDetails,
  onToggleDetails,
  onConnect,
  onDisconnect,
  isRunning,
}: StatusBarProps) {
  const vidPidLabel = useMemo(() => {
    if (!details.vendorId || !details.productId) {
      return '未知'
    }
    const vid = details.vendorId.toString(16).toUpperCase().padStart(4, '0')
    const pid = details.productId.toString(16).toUpperCase().padStart(4, '0')
    return `${vid} / ${pid}`
  }, [details.productId, details.vendorId])

  return (
    <header className={`status-bar ${showDetails ? 'expanded' : ''}`}>
      <div className="status-top">
        <div className="brand">
          <strong>WITRN HID Web</strong>
          <span>USB PD Live Decoder</span>
        </div>
        <div className="status-group">
          <div className={`mini-pill status-${pyStatus}`} title={heroStatus}>
            <span className="dot" />
            <span>Pyodide</span>
          </div>
          <div className={`mini-pill chip-${hidStatus}`} title={hidConnectionLabel}>
            <span className="dot" />
            <span>WebHID</span>
          </div>
        </div>
        <div className="status-actions">
          <button className="ghost" onClick={onToggleDetails} aria-expanded={showDetails}>
            {showDetails ? '收起设备信息' : '展开设备信息'}
          </button>
          {hidConnected ? (
            <button className="ghost" onClick={onDisconnect} disabled={isRunning}>
              断开
            </button>
          ) : (
            <button className="primary compact" onClick={onConnect} disabled={hidStatus === 'requesting'}>
              选择设备
            </button>
          )}
        </div>
      </div>
      {showDetails && (
        <div className="status-panel">
          {!hidSupported ? (
            <div className="status-panel-row">
              <strong>浏览器不支持 WebHID。</strong>
              <span>请使用 Chrome 89+ 或 Edge 89+ 打开本页面。</span>
            </div>
          ) : (
            <>
              <div className="status-panel-grid">
                <div className="status-panel-card">
                  <h3>连接说明</h3>
                  <ul>
                    <li>点击“选择设备”授权浏览器访问 WITRN HID 设备。</li>
                    <li>若首次使用，系统会弹出确认窗口，请选择正确的 VID/PID。</li>
                    <li>连接成功后，PD / 常规报文会实时显示在页面主区域。</li>
                  </ul>
                  <p className="hint">
                    提示：如需重新连接，可先点击“断开”再授权；设备拔出时页面会自动回到未连接状态。
                  </p>
                </div>
                <div className="status-panel-card">
                  <h3>设备状态</h3>
                  <dl>
                    <div>
                      <dt>当前状态</dt>
                      <dd>{hidConnectionLabel}</dd>
                    </div>
                    <div>
                      <dt>产品名称</dt>
                      <dd>{details.productName ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>VID / PID</dt>
                      <dd>{vidPidLabel}</dd>
                    </div>
                    <div>
                      <dt>接口已打开</dt>
                      <dd>{details.opened ? '是' : '否'}</dd>
                    </div>
                  </dl>
                  {hidError && <p className="status-error">{hidError.message}</p>}
                </div>
              <div className="status-panel-card">
                <h3>最近报文</h3>
                {latestReport ? (
                  <div className="latest-report">
                    <span>Report #{latestReport.reportId}</span>
                    <span>{latestReport.timestamp}</span>
                    <span>{latestReport.data.length} Bytes</span>
                    <code>{latestReport.hex}</code>
                  </div>
                ) : (
                  <p className="status-muted">尚未接收到报文。</p>
                )}
              </div>
              <div className="status-panel-card project-card">
                <h3>项目链接</h3>
                <div className="project-links">
                  <a
                    className="link-chip"
                    href="https://github.com/happyme531"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    作者 @happyme531
                  </a>
                  <a
                    className="link-chip"
                    href="https://github.com/happyme531/WITRN_HID_WEB"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    GitHub 仓库
                  </a>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    )}
    </header>
  )
})

export default StatusBar

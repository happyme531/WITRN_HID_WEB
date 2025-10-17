import { memo, useCallback, useEffect, useRef } from 'react'
import type { PdMessageEntry } from '../types/messages'
import PdDetailView from './PdDetailView'

type PdMessagesPanelProps = {
  pdMessages: PdMessageEntry[]
  selectedPd: PdMessageEntry | null
  selectedPdId: number | null
  autoFollowPd: boolean
  onToggleAutoFollow: () => void
  onSelectPd: (id: number) => void
  onClearPd: () => void
  showEmptyState: boolean
  canDecode: boolean
  onDecode: () => void
  actionError: string | null
  pyStatus: string
}

const PdMessagesPanel = memo(function PdMessagesPanel({
  pdMessages,
  selectedPd,
  selectedPdId,
  autoFollowPd,
  onToggleAutoFollow,
  onSelectPd,
  onClearPd,
  showEmptyState,
  actionError,
}: PdMessagesPanelProps) {
  const pdListRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!autoFollowPd) {
      return
    }
    const list = pdListRef.current
    if (!list) {
      return
    }
    requestAnimationFrame(() => {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' })
    })
  }, [autoFollowPd, pdMessages])

  const handleSelect = useCallback(
    (id: number) => {
      onSelectPd(id)
    },
    [onSelectPd],
  )

  return (
    <>
      {pdMessages.length > 0 && selectedPd && (
        <div className="pd-panel">
          <div className="pd-header">
            <div className="pd-title">PD 报文历史</div>
            <div className="pd-controls">
              <button className={`ghost ${autoFollowPd ? 'active' : ''}`} onClick={onToggleAutoFollow}>
                {autoFollowPd ? '自动跟随中' : '开启自动跟随'}
              </button>
              <button className="ghost" onClick={onClearPd} disabled={pdMessages.length === 0}>
                清空
              </button>
            </div>
          </div>
          <div className="pd-body">
            <div className="pd-list" ref={pdListRef}>
              {pdMessages.map((msg) => (
                <button
                  key={msg.id}
                  className={`pd-item ${selectedPdId === msg.id ? 'active' : ''}`}
                  onClick={() => handleSelect(msg.id)}
                >
                  <div className="pd-item-main">
                    <span className="pd-item-index">#{msg.index}</span>
                    <span className="pd-item-time">{msg.timestamp}</span>
                    <span className="pd-item-delta">+{msg.delta}</span>
                    <span className="pd-item-type">{msg.messageType}</span>
                  </div>
                  <div className="pd-item-tags">
                    <span className="pd-tag subtle">
                      PPR {msg.portPowerRole} · PDR {msg.portDataRole}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <PdDetailView message={selectedPd} />
          </div>
        </div>
      )}

      {showEmptyState && (
        <div className="empty-state">
          <p>等待解析结果…</p>
          <span>连接设备获取实时数据。</span>
          <div className="empty-actions">{actionError && <span className="error-text">{actionError}</span>}</div>
        </div>
      )}
    </>
  )
})

export default PdMessagesPanel

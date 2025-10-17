import { memo, useMemo } from 'react'
import type { MetadataNode, PdMessageEntry } from '../types/messages'
import { formatBitLoc, getChild, isNodeList, nodeChildren } from '../utils/metadata'

type PdDetailViewProps = {
  message: PdMessageEntry
}

type SummaryRow = {
  label: string
  value: string | number | null
}

const groupHex = (hex: string) => {
  const clean = hex.replace(/\s+/g, '')
  const pairs = clean.match(/.{1,2}/g) ?? []
  return pairs.map((pair, idx) => ({
    index: idx,
    byte: pair.toUpperCase(),
  }))
}

const SummarySection = ({ rows }: { rows: SummaryRow[] }) => {
  if (rows.length === 0) {
    return null
  }
  return (
    <div className="pd-detail-summary">
      {rows.map((row) => (
        <div key={row.label} className="summary-item">
          <span className="summary-label">{row.label}</span>
          <span className="summary-value">{row.value ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

const MetadataTree = ({ node }: { node: MetadataNode }) => {
  const children = nodeChildren(node)
  const bitLoc = formatBitLoc(node)
  return (
    <li>
      <div className="tree-node">
        <span className="tree-field">{node.field ?? '(root)'}</span>
        {bitLoc && <span className="tree-bitloc">{bitLoc}</span>}
        {typeof node.value !== 'object' || node.value === null ? (
          <span className="tree-value">{String(node.value)}</span>
        ) : null}
      </div>
      {children.length > 0 && (
        <ul>
          {children.map((child, index) => (
            <MetadataTree key={`${child.field ?? index}-${index}`} node={child} />
          ))}
        </ul>
      )}
    </li>
  )
}

const DataObjectCard = ({ node, index }: { node: MetadataNode; index: number }) => {
  const items = nodeChildren(node)
  return (
    <div className="data-object-card">
      <header>
        <span className="data-object-title">{node.field ?? `Data Object ${index + 1}`}</span>
        {node.bit_loc && <span className="data-object-bits">{formatBitLoc(node)}</span>}
      </header>
      <div className="data-object-body">
        {items.length === 0 && <span className="data-object-empty">无解析字段</span>}
        {items.map((item, idx) => (
          <div key={`${item.field ?? idx}`} className="data-object-row">
            <span className="row-field">{item.field ?? `字段 ${idx + 1}`}</span>
            <span className="row-value">
              {typeof item.value === 'object' && item.value !== null ? JSON.stringify(item.value) : String(item.value)}
            </span>
            {item.bit_loc && <span className="row-bits">{formatBitLoc(item)}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

const PdDetailView = memo(function PdDetailView({ message }: PdDetailViewProps) {
  const metadataRoot = message.tree
  const rootChildren = useMemo(() => (isNodeList(metadataRoot.value) ? metadataRoot.value : []), [metadataRoot])
  const messageHeader = useMemo(() => getChild(rootChildren, 'Message Header'), [rootChildren])
  const messageHeaderChildren = useMemo(() => nodeChildren(messageHeader), [messageHeader])

  const hexBytes = useMemo(() => groupHex(message.raw), [message.raw])

  const summaryRows = useMemo<SummaryRow[]>(() => {
    const mapValue = (field: string, fallback?: string) => {
      const node = getChild(messageHeaderChildren, field)
      if (!node) {
        return fallback ?? '—'
      }
      if (typeof node.value === 'object' && node.value !== null) {
        return JSON.stringify(node.value)
      }
      return String(node.value)
    }
    const rows: SummaryRow[] = [
      { label: '消息类型', value: message.messageType },
      { label: '端口角色', value: `${message.portPowerRole} / ${message.portDataRole}` },
      { label: 'Spec Revision', value: mapValue('Specification Revision', '未知') },
      { label: 'Message ID', value: mapValue('Message ID', '—') },
      { label: 'Number of Data Objects', value: mapValue('Number of Data Objects', '0') },
      { label: 'Timestamp', value: message.timestamp },
      { label: '长度', value: `${hexBytes.length} 字节` },
    ]
    if (message.length) {
      rows.push({ label: '比特范围', value: `${message.length} bits` })
    }
    return rows
  }, [hexBytes.length, message.length, message.portDataRole, message.portPowerRole, message.timestamp, messageHeaderChildren, message.messageType])

  const dataObjects = useMemo(() => {
    const payloadNode =
      getChild(rootChildren, 'Data Objects') ||
      getChild(rootChildren, 'Payload') ||
      null
    if (!payloadNode) {
      return []
    }
    const objects = nodeChildren(payloadNode)
    return objects.length > 0 ? objects : [payloadNode]
  }, [rootChildren])

  return (
    <div className="pd-detail">
      <SummarySection rows={summaryRows} />

      <section className="pd-detail-section">
        <header>数据对象</header>
        {dataObjects.length === 0 ? (
          <div className="pd-detail-empty">未解析到 Data Objects</div>
        ) : (
          <div className="data-object-grid">
            {dataObjects.map((node, index) => (
              <DataObjectCard key={`${node.field ?? 'object'}-${index}`} node={node} index={index} />
            ))}
          </div>
        )}
      </section>

      <section className="pd-detail-section">
        <header>原始 HEX</header>
        <div className="hex-grid">
          {hexBytes.map((item) => (
            <span key={item.index} className="hex-byte">
              {item.byte}
            </span>
          ))}
        </div>
      </section>

      <section className="pd-detail-section">
        <header>解析树</header>
        <div className="pd-tree">
          <ul>
            <MetadataTree node={metadataRoot} />
          </ul>
        </div>
      </section>
    </div>
  )
})

export default PdDetailView

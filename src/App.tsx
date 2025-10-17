import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MAX_UPDATES_PER_SECOND } from './config'
import { usePyodide } from './hooks/usePyodide'
import { useWebHID, type HidReport } from './hooks/useWebHID'
import StatusBar from './components/StatusBar'
import GeneralMetricsCard from './components/GeneralMetricsCard'
import PdMessagesPanel from './components/PdMessagesPanel'
import type {
  DecodeResult,
  GeneralMetrics,
  MetadataNode,
  PdMessageEntry,
  PendingPdEntry,
} from './types/messages'
import './App.css'
const UPDATE_INTERVAL_MS = 1000 / MAX_UPDATES_PER_SECOND

const formatTimestampMs = (ms: number) =>
  `${new Date(ms).toLocaleTimeString('zh-CN', { hour12: false })}.${String(ms % 1000).padStart(3, '0')}`

const statusLabel: Record<string, string> = {
  idle: '待启动',
  loading: '正在加载 Pyodide…',
  ready: 'Pyodide 就绪',
  error: '加载失败'
}

const hidStatusLabel: Record<string, string> = {
  unsupported: '浏览器不支持 WebHID',
  idle: '未连接',
  requesting: '等待设备授权…',
  opening: '尝试打开设备…',
  open: '设备已连接',
  closing: '正在断开…',
  error: '连接失败',
}

function App() {
  const { pyodide, status: pyStatus, error: pyError } = usePyodide()
  const {
    supported: hidSupported,
    status: hidStatus,
    error: hidError,
    connect,
    disconnect,
    latestReport,
    reportQueue,
    reportVersion,
    details: hidDetails,
    releaseReportsUpTo,
  } = useWebHID()
  const [actionError, setActionError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [showStatusPanel, setShowStatusPanel] = useState(false)
  const [pdMessages, setPdMessages] = useState<PdMessageEntry[]>([])
  const [autoFollowPd, setAutoFollowPd] = useState(true)
  const [selectedPdId, setSelectedPdId] = useState<number | null>(null)
  const [latestGeneral, setLatestGeneral] = useState<GeneralMetrics | null>(null)
  const pdIdCounter = useRef(0)
  const pdIndexCounter = useRef(0)
  const autoFollowRef = useRef(true)
  const lastPayloadRef = useRef('FF FF FF FF FF FF FF FF')
  const pendingReportsRef = useRef<HidReport[]>([])
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastUpdateRef = useRef(0)
  const pyodideRef = useRef(pyodide)
  const pyStatusRef = useRef(pyStatus)
  const lastQueuedSeqRef = useRef(0)
  const prevHidStatusRef = useRef(hidStatus)

  const heroStatus = useMemo(() => {
    if (pyStatus === 'error') {
      return `${statusLabel[pyStatus]}：${pyError?.message ?? '未知错误'}`
    }
    return statusLabel[pyStatus] ?? pyStatus
  }, [pyStatus, pyError])

  useEffect(() => {
    pyodideRef.current = pyodide
  }, [pyodide])

  useEffect(() => {
    pyStatusRef.current = pyStatus
  }, [pyStatus])

  useEffect(() => {
    if (prevHidStatusRef.current !== 'open' && hidStatus === 'open') {
      setShowStatusPanel(false)
    }
    prevHidStatusRef.current = hidStatus
  }, [hidStatus])

  const canDecode = pyStatus === 'ready' && !isRunning

  const extractGeneralMetrics = useCallback((decoded: DecodeResult): GeneralMetrics | null => {
    if (decoded.message !== 'general') {
      return null
    }
    const entries: Record<string, MetadataNode> = {}
    const children = Array.isArray(decoded.tree.value) ? decoded.tree.value : []
    children.forEach((child) => {
      if (child.field) {
        entries[child.field] = child
      }
    })

    const parseFloatSafe = (field: string) => {
      const meta = entries[field]
      if (!meta) {
        return 0
      }
      const rawValue = meta.value
      if (typeof rawValue !== 'string') {
        return 0
      }
      const numeric = parseFloat(rawValue.replace(/[^0-9+\-.]/g, ''))
      return Number.isNaN(numeric) ? 0 : numeric
    }

    const getString = (field: string) => {
      const meta = entries[field]
      if (!meta) {
        return null
      }
      const rawValue = meta.value
      return typeof rawValue === 'string' ? rawValue : null
    }

    const voltage = parseFloatSafe('VBus')
    const current = parseFloatSafe('Current')
    const temperatureStr = getString('Temperature')
    const temperature = temperatureStr ? parseFloat(temperatureStr.replace(/[^0-9+\-.]/g, '')) : null

    return {
      entries,
      voltage,
      current,
      temperature,
      power: voltage * current,
      ah: getString('Ah'),
      wh: getString('Wh'),
      rectime: getString('Rectime'),
      runtime: getString('Runtime'),
      dp: getString('D+'),
      dn: getString('D-'),
      cc1: getString('CC1'),
      cc2: getString('CC2'),
      group: getString('Group'),
    }
  }, [])

  const createPendingPdEntry = useCallback(
    (decoded: DecodeResult, timestampMs: number, timestampLabel: string): PendingPdEntry | null => {
      if (decoded.message !== 'pd') {
        return null
      }
      const rootChildren = Array.isArray(decoded.tree.value) ? decoded.tree.value : []
      const messageHeaderNode = rootChildren.find((node) => node.field === 'Message Header')
      let portPowerRole = '—'
      let portDataRole = '—'
      if (messageHeaderNode && Array.isArray(messageHeaderNode.value)) {
        const pprNode = messageHeaderNode.value.find((node) => node.field === 'Port Power Role' || node.field === 'Cable Plug')
        if (pprNode && typeof pprNode.value === 'string') {
          portPowerRole = pprNode.value
        }
        const pdrNode = messageHeaderNode.value.find((node) => node.field === 'Port Data Role')
        if (pdrNode && typeof pdrNode.value === 'string') {
          portDataRole = pdrNode.value
        }
      }

      return {
        timestamp: timestampLabel,
        timestampMs,
        messageType: decoded.pd_message_type ?? '未知',
        portPowerRole,
        portDataRole,
        raw: decoded.raw,
        tree: decoded.tree,
        length: decoded.tree?.bit_loc ? decoded.tree.bit_loc[1] - decoded.tree.bit_loc[0] + 1 : 0,
      }
    },
    [],
  )

  const applyGeneralMetrics = useCallback((metrics: GeneralMetrics) => {
    setLatestGeneral(metrics)
  }, [])

  const appendPdEntries = useCallback(
    (pendingEntries: PendingPdEntry[]) => {
      if (pendingEntries.length === 0) {
        return
      }
      const baseId = pdIdCounter.current
      const baseIndex = pdIndexCounter.current
      const prepared = pendingEntries.map((pending, offset) => ({
        id: baseId + offset + 1,
        index: baseIndex + offset + 1,
        timestamp: pending.timestamp,
        timestampMs: pending.timestampMs,
        messageType: pending.messageType,
        portPowerRole: pending.portPowerRole,
        portDataRole: pending.portDataRole,
        raw: pending.raw,
        tree: pending.tree,
        length: pending.length,
        sourceSeq: pending.sourceSeq,
      }))
      setPdMessages((prev) => {
        const next = [...prev]
        let lastEntry = next[next.length - 1]
        prepared.forEach((template) => {
          const delta = lastEntry
            ? `${((template.timestampMs - lastEntry.timestampMs) / 1000).toFixed(3)}s`
            : '0.000s'
          const entry: PdMessageEntry = {
            id: template.id,
            index: template.index,
            timestamp: template.timestamp,
            timestampMs: template.timestampMs,
            delta,
            messageType: template.messageType,
            portPowerRole: template.portPowerRole,
            portDataRole: template.portDataRole,
            raw: template.raw,
            tree: template.tree,
            length: template.length,
          }
          next.push(entry)
          lastEntry = entry
          console.log('[PD] append', {
            id: entry.id,
            index: entry.index,
            timestamp: entry.timestamp,
            sourceSeq: template.sourceSeq,
          })
        })
        return next
      })
      pdIdCounter.current += prepared.length
      pdIndexCounter.current += prepared.length
      const lastAppendedId = prepared[prepared.length - 1]?.id ?? null
      if (lastAppendedId !== null) {
        if (autoFollowRef.current) {
          setSelectedPdId(lastAppendedId)
        } else {
          setSelectedPdId((prev) => prev ?? lastAppendedId)
        }
      }
    },
    [],
  )

  const decodeHex = useCallback(
    (input: string): DecodeResult | null => {
      const currentPyodide = pyodideRef.current
      if (!currentPyodide) {
        return null
      }
      const decoder = currentPyodide.globals.get('decode_hex')
      let output: any
      try {
        output = decoder(input)
        const jsResult = output.toJs({
          create_proxies: false,
          dict_converter: Object.fromEntries,
        }) as DecodeResult
        return jsResult
      } finally {
        if (output) {
          output.destroy()
        }
        decoder.destroy()
      }
    },
    [],
  )

  const decodePayload = useCallback(
    async (input: string) => {
      if (!pyodide) {
        return null
      }
      setIsRunning(true)
      setActionError(null)
      try {
        const decoded = decodeHex(input)
        if (!decoded) {
          throw new Error('Pyodide 未就绪')
        }
        lastPayloadRef.current = input
        if (decoded.message === 'general') {
          const metrics = extractGeneralMetrics(decoded)
          if (metrics) {
            applyGeneralMetrics(metrics)
          }
        }
        if (decoded.message === 'pd') {
          const nowMs = Date.now()
          const pending = createPendingPdEntry(decoded, nowMs, formatTimestampMs(nowMs))
          if (pending) {
            appendPdEntries([pending])
          }
        }
        return decoded
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setActionError(message)
        return null
      } finally {
        setIsRunning(false)
      }
    },
    [appendPdEntries, applyGeneralMetrics, createPendingPdEntry, decodeHex, extractGeneralMetrics],
  )

  const handleDecode = async () => {
    await decodePayload(lastPayloadRef.current)
  }

  const lastProcessedSeqRef = useRef(0)
  const processPendingReports = useCallback((): boolean => {
    const queue = pendingReportsRef.current
    if (queue.length === 0) {
      return false
    }
    const currentPyodide = pyodideRef.current
    if (!currentPyodide || pyStatusRef.current !== 'ready') {
      setActionError((prev) => (prev ? prev : 'Pyodide 未就绪，暂缓解析 HID 报文'))
      return false
    }

    let errorMessage: string | null = null

    const pendingPd: PendingPdEntry[] = []
    let generalCount = 0
    let voltageSum = 0
    let currentSum = 0
    let powerSum = 0
    let temperatureSum = 0
    let temperatureCount = 0
    let lastGeneral: GeneralMetrics | null = null
    let didUpdate = false
    let lastSeqProcessed = lastProcessedSeqRef.current

    while (queue.length > 0) {
      const report = queue.shift()!
      if (report.data.length < 2) {
        errorMessage = '收到的 HID 报文长度异常，已忽略'
        lastSeqProcessed = Math.max(lastSeqProcessed, report.seq)
        continue
      }

      const isGeneral = report.data[0] === 0xFF
      const isPd = report.data[0] === 0xFE

      if (isGeneral && report.data.length < 64) {
        errorMessage = '常规报文长度不足 64 字节，已忽略'
        lastSeqProcessed = Math.max(lastSeqProcessed, report.seq)
        continue
      }

      if (isPd) {
        const expected = report.data[1] + 2
        if (report.data.length < expected) {
          errorMessage = 'PD 报文长度不足，已忽略'
          lastSeqProcessed = Math.max(lastSeqProcessed, report.seq)
          continue
        }
      }

      let decoded: DecodeResult | null = null
      try {
        decoded = decodeHex(report.hex)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errorMessage = message
        console.log('decode-failed', errorMessage + report.hex)
      }
      if (!decoded) {
        if (isPd) {
          console.log('[PD] decode-failed', {
            seq: report.seq,
            timestamp: report.timestamp,
          })
        }
        lastSeqProcessed = Math.max(lastSeqProcessed, report.seq)
        continue
      }
      lastPayloadRef.current = report.hex
      lastSeqProcessed = Math.max(lastSeqProcessed, report.seq)

      if (decoded.message === 'general') {
        const metrics = extractGeneralMetrics(decoded)
        if (!metrics) {
          continue
        }
        generalCount += 1
        voltageSum += metrics.voltage
        currentSum += metrics.current
        powerSum += metrics.power
        if (metrics.temperature !== null) {
          temperatureSum += metrics.temperature
          temperatureCount += 1
        }
        lastGeneral = metrics
      }

      if (decoded.message === 'pd') {
        console.log('[PD] decoded', {
          seq: report.seq,
          timestamp: report.timestamp,
          hex: report.hex,
          length: report.data.length,
        })
        const pendingEntry = createPendingPdEntry(decoded, report.timestampMs, report.timestamp)
        if (pendingEntry) {
          pendingPd.push({ ...pendingEntry, sourceSeq: report.seq })
        }
      } else if (isPd) {
        console.log('[PD] decoded-mismatch', {
          seq: report.seq,
          timestamp: report.timestamp,
          message: decoded.message,
        })
      }
    }

    if (generalCount > 0 && lastGeneral) {
      const averaged: GeneralMetrics = {
        ...lastGeneral,
        voltage: voltageSum / generalCount,
        current: currentSum / generalCount,
        power: powerSum / generalCount,
        temperature: temperatureCount > 0 ? temperatureSum / temperatureCount : null,
      }
      applyGeneralMetrics(averaged)
      didUpdate = true
    }

    if (pendingPd.length > 0) {
      appendPdEntries(pendingPd)
      didUpdate = true
    }

    if (lastSeqProcessed > lastProcessedSeqRef.current) {
      lastProcessedSeqRef.current = lastSeqProcessed
      releaseReportsUpTo(lastSeqProcessed)
    }

    if (didUpdate) {
      lastUpdateRef.current = Date.now()
    }

    if (errorMessage) {
      setActionError(errorMessage)
    }

    return didUpdate
  }, [appendPdEntries, applyGeneralMetrics, createPendingPdEntry, decodeHex, extractGeneralMetrics, releaseReportsUpTo])

  const scheduleProcessing = useCallback(() => {
    if (processingTimerRef.current !== null) {
      return
    }
    const now = Date.now()
    const elapsed = now - lastUpdateRef.current
    const delay = elapsed >= UPDATE_INTERVAL_MS ? 0 : UPDATE_INTERVAL_MS - elapsed
    processingTimerRef.current = setTimeout(() => {
      processingTimerRef.current = null
      const didUpdate = processPendingReports()
      if (!didUpdate) {
        lastUpdateRef.current = Date.now()
      }
      if (pendingReportsRef.current.length > 0) {
        scheduleProcessing()
      }
    }, delay)
  }, [processPendingReports])

  useEffect(() => {
    const newReports = reportQueue.filter((report) => report.seq > lastQueuedSeqRef.current)
    if (newReports.length === 0) {
      return
    }

    const pdReports = newReports.filter((report) => report.data[0] === 0xFE)
    if (pdReports.length > 0) {
      console.log('[PD] queue', pdReports.map((report) => ({
        seq: report.seq,
        reportId: report.reportId,
        ts: report.timestamp,
        len: report.data.length,
      })))
    }

    pendingReportsRef.current.push(...newReports)

    const lastSeq = newReports[newReports.length - 1]?.seq
    if (lastSeq) {
      lastQueuedSeqRef.current = lastSeq
    }
    scheduleProcessing()
  }, [reportQueue, reportVersion, scheduleProcessing])

  useEffect(() => {
    if (hidStatus !== 'open') {
      lastProcessedSeqRef.current = 0
      lastQueuedSeqRef.current = 0
      pendingReportsRef.current = []
      if (processingTimerRef.current !== null) {
        clearTimeout(processingTimerRef.current)
        processingTimerRef.current = null
      }
    }
  }, [hidStatus])

  useEffect(() => {
    return () => {
      if (processingTimerRef.current !== null) {
        clearTimeout(processingTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (pyStatus === 'ready' && pendingReportsRef.current.length > 0) {
      scheduleProcessing()
    }
  }, [pyStatus, scheduleProcessing])

  const hidConnectionLabel = useMemo(() => hidStatusLabel[hidStatus] ?? hidStatus, [hidStatus])
  const hidConnected = hidStatus === 'open'

  useEffect(() => {
    autoFollowRef.current = autoFollowPd
  }, [autoFollowPd])

  useEffect(() => {
    if (pdMessages.length === 0 && selectedPdId !== null) {
      setSelectedPdId(null)
    }
  }, [pdMessages, selectedPdId])

  const selectedPd = useMemo(() => {
    if (pdMessages.length === 0) {
      return null
    }
    if (!selectedPdId) {
      return pdMessages[pdMessages.length - 1]
    }
    return pdMessages.find((msg) => msg.id === selectedPdId) ?? pdMessages[pdMessages.length - 1]
  }, [pdMessages, selectedPdId])

  const latestReportEntry = latestReport
  const showEmptyState = !latestGeneral && pdMessages.length === 0

  const handleToggleAutoFollow = useCallback(() => {
    setAutoFollowPd((prev) => {
      const next = !prev
      autoFollowRef.current = next
      return next
    })
  }, [])

  const handleSelectPd = useCallback(
    (id: number) => {
      setSelectedPdId(id)
      setAutoFollowPd(false)
      autoFollowRef.current = false
    },
    [],
  )

  const handleClearPd = useCallback(() => {
    setPdMessages([])
    setSelectedPdId(null)
    pdIndexCounter.current = 0
    pdIdCounter.current = 0
  }, [])

  const handleToggleStatusPanel = useCallback(() => {
    setShowStatusPanel((prev) => !prev)
  }, [])

  return (
    <div className="app-shell">
      <div className="aurora" aria-hidden="true" />
      <StatusBar
        pyStatus={pyStatus}
        heroStatus={heroStatus}
        hidStatus={hidStatus}
        hidConnectionLabel={hidConnectionLabel}
        hidConnected={hidConnected}
        hidSupported={hidSupported}
        hidError={hidError}
        details={hidDetails}
        latestReport={latestReportEntry}
        showDetails={showStatusPanel}
        onToggleDetails={handleToggleStatusPanel}
        onConnect={connect}
        onDisconnect={disconnect}
        isRunning={isRunning}
      />

      <main className="workspace single">
        <section className="panel output-panel">
          <div className="result-card">
            <GeneralMetricsCard metrics={latestGeneral} />

            <PdMessagesPanel
              pdMessages={pdMessages}
              selectedPd={selectedPd}
              selectedPdId={selectedPdId}
              autoFollowPd={autoFollowPd}
              onToggleAutoFollow={handleToggleAutoFollow}
              onSelectPd={handleSelectPd}
              onClearPd={handleClearPd}
              showEmptyState={showEmptyState}
              canDecode={canDecode}
              onDecode={handleDecode}
              actionError={actionError}
              pyStatus={pyStatus}
            />
          </div>
        </section>
      </main>

    </div>
  )
}

export default App

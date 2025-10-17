import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { MAX_UPDATES_PER_SECOND } from '../config'

type HidStatus =
  | 'unsupported'
  | 'idle'
  | 'requesting'
  | 'opening'
  | 'open'
  | 'closing'
  | 'error'

export type HidReport = {
  seq: number
  reportId: number
  data: Uint8Array
  hex: string
  timestamp: string
  timestampMs: number
}

const VENDOR_ID = 0x0716
const QUEUE_NOTIFY_INTERVAL_MS = 100 / MAX_UPDATES_PER_SECOND

const isWebHIDAvailable = () => typeof navigator !== 'undefined' && 'hid' in navigator

function formatHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ')
}

function formatTimestamp(date: Date) {
  return `${date.toLocaleTimeString('zh-CN', { hour12: false })}.${date
    .getMilliseconds()
    .toString()
    .padStart(3, '0')}`
}

export function useWebHID() {
  const supported = useMemo(() => isWebHIDAvailable(), [])
  const [status, setStatus] = useState<HidStatus>(supported ? 'idle' : 'unsupported')
  const [device, setDevice] = useState<HIDDevice | null>(null)
  const reportQueueRef = useRef<HidReport[]>([])
  const [queueVersion, setQueueVersion] = useState(0)
  const queueLimit = 1000
  const [error, setError] = useState<Error | null>(null)
  const manualDisconnectRef = useRef(false)
  const deviceRef = useRef<HIDDevice | null>(null)
  const reportSeqRef = useRef(0)
  const notifyTimerRef = useRef<number | null>(null)
  const lastNotifyRef = useRef(0)

  const flushQueueVersion = useCallback(() => {
    if (notifyTimerRef.current !== null) {
      clearTimeout(notifyTimerRef.current)
      notifyTimerRef.current = null
    }
    lastNotifyRef.current = Date.now()
    setQueueVersion((version) => version + 1)
  }, [])

  const scheduleQueueNotification = useCallback(() => {
    const now = Date.now()
    const elapsed = now - lastNotifyRef.current
    if (elapsed >= QUEUE_NOTIFY_INTERVAL_MS) {
      flushQueueVersion()
      return
    }
    if (notifyTimerRef.current === null) {
      const delay = Math.max(QUEUE_NOTIFY_INTERVAL_MS - elapsed, 0)
      notifyTimerRef.current = window.setTimeout(flushQueueVersion, delay)
    }
  }, [flushQueueVersion])
  const handleReport = useCallback((event: HIDInputReportEvent) => {
    const { data, reportId } = event
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    const clone = new Uint8Array(bytes)
    const now = Date.now()
    const report: HidReport = {
      seq: ++reportSeqRef.current,
      reportId,
      data: clone,
      hex: formatHex(clone),
      timestamp: formatTimestamp(new Date(now)),
      timestampMs: now,
    }
    const queue = reportQueueRef.current
    queue.push(report)
    if (queue.length > queueLimit) {
      console.log("pkt drop!!")
      queue.shift()
    }
    if (clone[0] === 0xFE) {
      console.log('[PD] hid receive', {
        seq: report.seq,
        reportId,
        len: clone.length,
        timestamp: report.timestamp,
      })
    }
    scheduleQueueNotification()

    // 每秒打印收到的数据包个数
    let counter = window.packetCounter
    if (!counter) {
      counter = {
        count: 0,
        lastSecond: Math.floor(now / 1000),
        timer: setInterval(() => {
          const tracker = window.packetCounter
          if (!tracker) {
            return
          }
          const currentSecond = Math.floor(Date.now() / 1000)
          if (currentSecond !== tracker.lastSecond) {
            console.log(`每秒数据包: ${tracker.count} pkt/s`)
            tracker.count = 0
            tracker.lastSecond = currentSecond
          }
        }, 100),
      }
      window.packetCounter = counter
    }
    counter.count += 1
  }, [scheduleQueueNotification])

  const releaseReportsUpTo = useCallback((seq: number) => {
    if (seq <= 0) {
      return
    }
    const queue = reportQueueRef.current
    if (queue.length === 0) {
      return
    }
    let removeCount = 0
    while (removeCount < queue.length && queue[removeCount].seq <= seq) {
      removeCount += 1
    }
    if (removeCount > 0) {
      const removed = queue.slice(0, removeCount)
      const removedPd = removed.some((item) => item.data[0] === 0xFE)
      if (removedPd) {
        console.log('[PD] release', { upTo: seq, remove: removeCount, before: queue.length })
      }
      queue.splice(0, removeCount)
      if (removedPd) {
        console.log('[PD] release done', { remaining: queue.length })
      }
      flushQueueVersion()
    }
  }, [flushQueueVersion])

  const attachListeners = useCallback(
    async (hidDevice: HIDDevice) => {
      try {
        if (!hidDevice.opened) {
          await hidDevice.open()
        }
        hidDevice.removeEventListener('inputreport', handleReport)
        hidDevice.addEventListener('inputreport', handleReport)
        deviceRef.current = hidDevice
        setDevice(hidDevice)
        setStatus('open')
      } catch (err) {
        setError(err as Error)
        setStatus('error')
        throw err
      }
    },
    [handleReport],
  )

  const detachListeners = useCallback(
    async (hidDevice: HIDDevice | null) => {
      if (!hidDevice) {
        return
      }
      hidDevice.removeEventListener('inputreport', handleReport)
      if (hidDevice.opened) {
        try {
          await hidDevice.close()
        } catch (closeError) {
          console.warn('关闭 HID 设备失败', closeError)
        }
      }
    },
    [handleReport],
  )

  const connect = useCallback(async () => {
    if (!supported) {
      return
    }

    try {
      setError(null)
      setStatus('requesting')
      const hid = navigator.hid
      if (!hid) {
        setStatus('unsupported')
        return
      }

      const devices = await hid.requestDevice({
        filters: [{ vendorId: VENDOR_ID }],
      })

      const [selected] = devices
      if (!selected) {
        setStatus('idle')
        return
      }

      setStatus('opening')
      manualDisconnectRef.current = false
      await attachListeners(selected)
    } catch (err) {
      const domError = err as DOMException
      if (domError?.name === 'NotFoundError' || domError?.name === 'AbortError') {
        setStatus('idle')
        return
      }
      setStatus('error')
      setError(err as Error)
    }
  }, [attachListeners, supported])

  const disconnect = useCallback(async () => {
    manualDisconnectRef.current = true
    setStatus('closing')
    const target = device ?? deviceRef.current
    await detachListeners(target)
    deviceRef.current = null
    setDevice(null)
    reportQueueRef.current = []
    setQueueVersion((version) => version + 1)
    reportSeqRef.current = 0
    if (notifyTimerRef.current !== null) {
      clearTimeout(notifyTimerRef.current)
      notifyTimerRef.current = null
    }
    lastNotifyRef.current = 0
    const counter = window.packetCounter
    if (counter) {
      clearInterval(counter.timer)
      window.packetCounter = undefined
    }
    setStatus('idle')
  }, [detachListeners, device])

  useEffect(() => {
    if (!supported) {
      return
    }

    let isMounted = true

    async function init() {
      const hid = navigator.hid
      if (!hid) {
        setStatus('unsupported')
        return
      }
      try {
        const grantedDevices = await hid.getDevices()
        const target = grantedDevices.find(
          (item) => item.vendorId === VENDOR_ID,
        )
        if (target && isMounted && !manualDisconnectRef.current) {
          setStatus('opening')
          await attachListeners(target)
        }
      } catch (err) {
        if (!isMounted) {
          return
        }
        setError(err as Error)
        setStatus('error')
      }
    }

    init()

    const handleDisconnect = (event: HIDConnectionEvent) => {
      if (event.device === deviceRef.current) {
        setStatus('idle')
        setDevice(null)
        deviceRef.current = null
        manualDisconnectRef.current = false
      }
    }

    const hid = navigator.hid
    hid?.addEventListener('disconnect', handleDisconnect)

    return () => {
      isMounted = false
      hid?.removeEventListener('disconnect', handleDisconnect)
      detachListeners(deviceRef.current)
      if (notifyTimerRef.current !== null) {
        clearTimeout(notifyTimerRef.current)
        notifyTimerRef.current = null
      }
      lastNotifyRef.current = 0
      const counter = window.packetCounter
      if (counter) {
        clearInterval(counter.timer)
        window.packetCounter = undefined
      }
    }
  }, [attachListeners, detachListeners, supported])

  const details = useMemo(
    () => ({
      vendorId: device?.vendorId,
      productId: device?.productId,
      productName: device?.productName,
      opened: device?.opened ?? false,
    }),
    [device],
  )

  const reportQueue = useMemo(() => reportQueueRef.current, [queueVersion])
  const latestReport = useMemo(
    () => (reportQueueRef.current.length > 0 ? reportQueueRef.current[reportQueueRef.current.length - 1] : null),
    [queueVersion],
  )

  return {
    supported,
    status,
    error,
    connect,
    disconnect,
    latestReport,
    reportQueue,
    reportVersion: queueVersion,
    details,
    releaseReportsUpTo,
  }
}

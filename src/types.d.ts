export {}

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<any>
  }

  interface HID {
    requestDevice(options: { filters?: Array<{ vendorId?: number; productId?: number }> }): Promise<HIDDevice[]>
    getDevices(): Promise<HIDDevice[]>
    addEventListener(type: 'connect' | 'disconnect', listener: (event: HIDConnectionEvent) => void): void
    removeEventListener(type: 'connect' | 'disconnect', listener: (event: HIDConnectionEvent) => void): void
  }

  interface HIDDevice {
    vendorId: number
    productId: number
    productName?: string
    opened: boolean
    collections?: HIDCollectionInfo[]
    open(): Promise<void>
    close(): Promise<void>
    addEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void
    removeEventListener(type: 'inputreport', listener: (event: HIDInputReportEvent) => void): void
  }

  interface HIDInputReportEvent extends Event {
    device: HIDDevice
    reportId: number
    data: DataView
  }

  interface HIDConnectionEvent extends Event {
    device: HIDDevice
  }

  interface HIDCollectionInfo {
    usagePage: number
    usage: number
    reports?: Array<{ reportId: number }>
  }

  interface Navigator {
    hid?: HID
  }
}

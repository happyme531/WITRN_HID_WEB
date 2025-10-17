declare global {
  interface Window {
    packetCounter?: {
      count: number
      lastSecond: number
      timer: ReturnType<typeof setInterval>
    }
  }
}

export {}

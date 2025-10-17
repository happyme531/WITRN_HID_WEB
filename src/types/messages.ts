export type MetadataValue = string | number | boolean | MetadataNode[] | null

export type MetadataNode = {
  field: string | null
  bit_loc: [number, number] | null
  raw: string | null
  value: MetadataValue
}

export type DecodeResult = {
  status: string
  message: string
  raw: string
  tree: MetadataNode
  pd_message_type?: string | null
}

export type GeneralMetrics = {
  entries: Record<string, MetadataNode>
  voltage: number
  current: number
  temperature: number | null
  power: number
  ah: string | null
  wh: string | null
  rectime: string | null
  runtime: string | null
  dp: string | null
  dn: string | null
  cc1: string | null
  cc2: string | null
  group: string | null
}

export type PdMessageEntry = {
  id: number
  index: number
  timestamp: string
  timestampMs: number
  delta: string
  messageType: string
  portPowerRole: string
  portDataRole: string
  raw: string
  tree: MetadataNode
  length: number
}

export type PendingPdEntry = {
  timestamp: string
  timestampMs: number
  messageType: string
  portPowerRole: string
  portDataRole: string
  raw: string
  tree: MetadataNode
  length: number
  sourceSeq?: number
}

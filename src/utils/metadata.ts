import type { MetadataNode } from '../types/messages'

export const isNodeList = (value: unknown): value is MetadataNode[] => Array.isArray(value)

export const getChild = (nodes: MetadataNode[] | null | undefined, field: string): MetadataNode | null => {
  if (!nodes) {
    return null
  }
  return nodes.find((item) => item.field === field) ?? null
}

export const nodeChildren = (node: MetadataNode | null | undefined): MetadataNode[] => {
  if (!node) {
    return []
  }
  return isNodeList(node.value) ? node.value : []
}

export const formatBitLoc = (node: MetadataNode | null | undefined): string | null => {
  if (!node?.bit_loc) {
    return null
  }
  const [from, to] = node.bit_loc
  if (from === to) {
    return `bit ${from}`
  }
  return `bits ${from}-${to}`
}

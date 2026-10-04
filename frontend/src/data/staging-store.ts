import type { ReviewItem, SedimentDraft } from './types'

// 暂存区与正式台账分开存放：现场记录先落暂存，提交后才进入 sediment 正式数据。
const STAGING_KEY = 'hydrology-monitor-station:sediment-staging'
const REVIEW_KEY = 'hydrology-monitor-station:review-items'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    window.localStorage.setItem(key, JSON.stringify(fallback))
    return fallback
  }
}

function writeJSON<T>(key: string, value: T): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, JSON.stringify(value))
  }
}

// ---- 泥沙草稿：按记录编号唯一，刷新/重进后继续编辑 ----

let draftCache: SedimentDraft[] | null = null

function readDrafts(): SedimentDraft[] {
  if (draftCache === null) {
    draftCache = readJSON<SedimentDraft[]>(STAGING_KEY, [])
  }
  return draftCache
}

function persistDrafts(drafts: SedimentDraft[]): void {
  draftCache = drafts
  writeJSON(STAGING_KEY, drafts)
}

export function listSedimentDrafts(): SedimentDraft[] {
  // 暂存区只展示可继续编辑的草稿；已提交的仅保留用于并发去重。
  return readDrafts().filter((draft) => draft.state === 'staged')
}

export function getSedimentDraft(code: string): SedimentDraft | undefined {
  return readDrafts().find((draft) => draft.记录编号 === code)
}

export function saveSedimentDraft(draft: SedimentDraft): void {
  const drafts = readDrafts()
  const index = drafts.findIndex((item) => item.记录编号 === draft.记录编号)
  if (index >= 0) {
    drafts[index] = draft
  } else {
    drafts.push(draft)
  }
  persistDrafts(drafts)
}

export function removeSedimentDraft(code: string): void {
  persistDrafts(readDrafts().filter((draft) => draft.记录编号 !== code))
}

/**
 * 原子认领草稿：同一时刻只有一个提交能把 staged 翻成 submitting。
 * localStorage 的同步读写保证了刷新、多标签与快速连点下都只有第一次有效。
 */
export function claimSedimentDraft(code: string): SedimentDraft | undefined {
  const drafts = readDrafts()
  const draft = drafts.find((item) => item.记录编号 === code)
  if (!draft || draft.state !== 'staged') {
    return undefined
  }
  const claimed: SedimentDraft = { ...draft, state: 'submitting', updatedAt: new Date().toISOString() }
  persistDrafts(drafts.map((item) => (item.记录编号 === code ? claimed : item)))
  return claimed
}

// ---- 整编待核事项：泥沙提交联动生成 ----

let reviewCache: ReviewItem[] | null = null

function readReviews(): ReviewItem[] {
  if (reviewCache === null) {
    reviewCache = readJSON<ReviewItem[]>(REVIEW_KEY, [])
  }
  return reviewCache
}

function persistReviews(items: ReviewItem[]): void {
  reviewCache = items
  writeJSON(REVIEW_KEY, items)
}

export function listReviewItems(): ReviewItem[] {
  return clone(readReviews())
}

export function addReviewItem(item: Omit<ReviewItem, 'id'>): ReviewItem {
  const items = readReviews()
  const nextId = items.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const created: ReviewItem = { ...item, id: nextId }
  persistReviews([...items, created])
  return clone(created)
}

export function resolveReviewItem(id: number, status: '已确认' | '已驳回'): boolean {
  const items = readReviews()
  const index = items.findIndex((item) => Number(item.id) === id)
  if (index < 0 || items[index].status !== '待核') {
    return false
  }
  items[index] = { ...items[index], status, handledAt: new Date().toISOString() }
  persistReviews(items)
  return true
}

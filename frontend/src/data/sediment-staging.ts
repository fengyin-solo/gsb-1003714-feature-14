import { readBlob, writeBlob } from './local-store'
import type { ReviewItem, SedimentStagingState } from './types'

// 暂存区与正式清单分开存放：刷新、关掉浏览器再进来，未提交的现场记录仍可继续编辑。
export const SEDIMENT_STAGING_KEY = 'hydrology-monitor-station:sediment-staging'
export const REVIEW_ITEMS_KEY = 'hydrology-monitor-station:review-items'

const EMPTY_STAGING: SedimentStagingState = { drafts: [], activeDraftKey: null }

export function readStaging(): SedimentStagingState {
  const state = readBlob<SedimentStagingState>(SEDIMENT_STAGING_KEY, EMPTY_STAGING)
  return {
    drafts: Array.isArray(state.drafts) ? state.drafts : [],
    activeDraftKey: state.activeDraftKey ?? null,
  }
}

export function writeStaging(state: SedimentStagingState): SedimentStagingState {
  return writeBlob(SEDIMENT_STAGING_KEY, state)
}

export function readReviewItems(): ReviewItem[] {
  const items = readBlob<ReviewItem[]>(REVIEW_ITEMS_KEY, [])
  return Array.isArray(items) ? items : []
}

export function writeReviewItems(items: ReviewItem[]): ReviewItem[] {
  return writeBlob(REVIEW_ITEMS_KEY, items)
}

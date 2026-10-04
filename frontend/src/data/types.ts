/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

/** 泥沙现场记录在暂存区里的编辑内容：含沙量/输沙率/颗粒级配允许乱序、留空后继续补。 */
export type SedimentDraftData = {
  记录编号: string
  站点编号: string
  采样时间: string
  含沙量: string
  输沙率: string
  颗粒级配: string
  采样人: string
  级配说明: string
}

/** 暂存草稿：提交时会走原子认领，并发提交只有第一次有效。 */
export type SedimentDraft = SedimentDraftData & {
  state: 'staged' | 'submitting' | 'submitted'
  createdAt: string
  updatedAt: string
}

export type DraftSubmitResult = {
  ok: boolean
  message: string
}

/** 整编侧的待核事项：别的入口（泥沙暂存提交）联动生成，确认/驳回后关闭。 */
export type ReviewItem = {
  id: number
  sourceKey: string
  sourceLabel: string
  记录编号: string
  站点编号: string
  采样时间: string
  reason: '新增待审' | '旧样本沿用原值'
  detail: string
  status: '待核' | '已确认' | '已驳回'
  createdAt: string
  handledAt?: string
}

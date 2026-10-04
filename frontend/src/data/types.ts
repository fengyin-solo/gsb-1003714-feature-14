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

// 泥沙现场记录表单：数值字段用字符串承载，空串表示未填，'0' 是合法的实测零值。
export type SedimentForm = {
  记录编号: string
  站点编号: string
  采样时间: string
  含沙量: string
  输沙率: string
  颗粒级配: string
  采样人: string
  级配缺失说明: string
}

export type SedimentDraft = {
  draftKey: string
  createdAt: number
  updatedAt: number
  // 提交成功后回填正式记录编号；再次提交据此幂等沿用，不重复落库。
  submittedId: number | null
  submittedAt: number | null
  form: SedimentForm
}

export type SedimentStagingState = {
  drafts: SedimentDraft[]
  activeDraftKey: string | null
}

export type ReviewItem = {
  id: string
  sourceModule: 'sediment'
  recordId: number
  记录编号: string
  站点编号: string
  采样时间: string
  reasons: string[]
  note: string
  status: '待核' | '已核'
  createdAt: number
  updatedAt: number
}

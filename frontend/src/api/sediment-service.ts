import {
  addReviewItem,
  claimSedimentDraft,
  getSedimentDraft,
  listSedimentDrafts,
  removeSedimentDraft,
  saveSedimentDraft,
} from '@/data/staging-store'
import { listRows, saveRows } from '@/data/local-store'
import type {
  DraftSubmitResult,
  EntryRow,
  ReviewItem,
  SedimentDraft,
  SedimentDraftData,
} from '@/data/types'

export type { ReviewItem } from '@/data/types'
export { listReviewItems, resolveReviewItem } from '@/data/staging-store'

// 现场登记表单字段顺序就是暂存写入顺序，含沙量/输沙率/颗粒级配各自独立，不要求固定填写次序。
const EMPTY_FORM: SedimentDraftData = {
  记录编号: '',
  站点编号: '',
  采样时间: '',
  含沙量: '',
  输沙率: '',
  颗粒级配: '',
  采样人: '',
  级配说明: '',
}

export function emptySedimentForm(): SedimentDraftData {
  return { ...EMPTY_FORM }
}

export function listStagedDrafts(): SedimentDraft[] {
  return listSedimentDrafts()
}

export function findStagedDraft(code: string): SedimentDraft | undefined {
  const draft = getSedimentDraft(code)
  return draft && draft.state === 'staged' ? draft : undefined
}

function trimDraft(data: SedimentDraftData): SedimentDraftData {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, String(value ?? '').trim()]),
  ) as SedimentDraftData
}

/**
 * 落暂存：不做完整性校验，现场可先存后补；按记录编号复用同一份草稿（同草稿再次暂存沿用已有草稿）。
 * 已进入提交链路（submitting/submitted）的草稿不允许覆盖，避免并发提交互相串值。
 */
export function stageDraft(input: SedimentDraftData): DraftSubmitResult {
  const data = trimDraft(input)
  if (!data.记录编号) {
    return { ok: false, message: '记录编号不能为空，暂存区按记录编号区分草稿' }
  }
  const existing = getSedimentDraft(data.记录编号)
  if (existing && existing.state !== 'staged') {
    return { ok: false, message: `草稿「${data.记录编号}」已进入提交链路，不能再覆盖` }
  }
  const now = new Date().toISOString()
  const draft: SedimentDraft = {
    ...data,
    state: 'staged',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  saveSedimentDraft(draft)
  return { ok: true, message: `现场记录已落入暂存区，可随时继续编辑「${data.记录编号}」` }
}

export function discardDraft(code: string): DraftSubmitResult {
  const draft = getSedimentDraft(code)
  if (!draft) {
    return { ok: false, message: `暂存区里没有「${code}」这份草稿` }
  }
  if (draft.state !== 'staged') {
    return { ok: false, message: `草稿「${code}」已进入提交链路，不能删除` }
  }
  removeSedimentDraft(code)
  return { ok: true, message: `已丢弃暂存草稿「${code}」` }
}

// 非负数值：0 是合法实测值，必须保留，不得当作空值或异常。
function readMeasure(label: string, raw: string): number | string {
  const value = raw.trim()
  if (value === '') {
    return ''
  }
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${label}需为不小于 0 的数值，当前填写「${value}」`)
  }
  return num
}

/** 提交前完整性校验：零值通过；仅颗粒级配缺失时要求补一段说明并随记录保留。 */
export function validateDraft(data: SedimentDraftData): string | null {
  const trimmed = trimDraft(data)
  for (const field of ['记录编号', '站点编号', '采样时间', '采样人'] as const) {
    if (!trimmed[field]) {
      return `${field}未填写，不能提交`
    }
  }
  try {
    readMeasure('含沙量', trimmed.含沙量)
    readMeasure('输沙率', trimmed.输沙率)
  } catch (error) {
    return error instanceof Error ? error.message : '实测数值格式有误'
  }
  if (!trimmed.颗粒级配 && !trimmed.级配说明) {
    return '颗粒级配缺失时，请填写级配说明（缺测原因/后续补测安排）后再提交'
  }
  return null
}

/**
 * 顺着暂存 → 提交链路处理一份草稿：
 * 1. 原子认领，并发提交只保留第一次有效草稿，其余提示沿用已有草稿；
 * 2. 提交前完整性校验，失败释放回暂存，可继续编辑；
 * 3. 查正式台账是否已有通过结论，已通过则不再重复提交；
 * 4. 旧样本沿用原值、只生成待核事项；新样本新建待审核记录；两种情况都联动整编待核事项。
 */
export function submitDraft(code: string): DraftSubmitResult {
  const draft = getSedimentDraft(code)
  if (!draft) {
    return { ok: false, message: `暂存区里没有「${code}」这份草稿` }
  }
  if (draft.state === 'submitted') {
    return { ok: false, message: `「${code}」已经提交过，同一草稿沿用首次提交结果` }
  }
  const claimed = claimSedimentDraft(code)
  if (!claimed) {
    return { ok: false, message: `「${code}」正在提交中，并发提交只保留第一次有效草稿` }
  }

  const validationError = validateDraft(claimed)
  if (validationError) {
    // 校验失败释放回暂存，现场继续补录。
    saveSedimentDraft({ ...claimed, state: 'staged' })
    return { ok: false, message: validationError }
  }

  const data = trimDraft(claimed)
  const rows = listRows('sediment')
  const official = rows.find((row) => String(row['记录编号']) === data.记录编号)

  // 已有通过结论：停在提交链路前，由人工决定，不重复生成待审核。
  if (official && String(official.status) === '已通过') {
    saveSedimentDraft({ ...claimed, state: 'staged' })
    return { ok: false, message: `「${data.记录编号}」已有通过结论，不能重复提交；如需变更请走复核流程` }
  }

  const now = new Date().toISOString()
  const 含沙量 = readMeasure('含沙量', data.含沙量)
  const 输沙率 = readMeasure('输沙率', data.输沙率)
  const 颗粒级配 = data.颗粒级配
  const 级配说明 = data.级配说明

  let item: ReviewItem
  if (official) {
    // 旧样本冲突：沿用原值，不改正式记录，仅联动一条待核事项。
    item = addReviewItem({
      sourceKey: 'sediment',
      sourceLabel: '泥沙监测',
      记录编号: data.记录编号,
      站点编号: data.站点编号,
      采样时间: data.采样时间,
      reason: '旧样本沿用原值',
      detail: `暂存记录与既有「${String(official.status)}」记录同号，已沿用原样本值待核`
        + (颗粒级配 ? '' : '；颗粒级配缺测，说明：' + 级配说明),
      status: '待核',
      createdAt: now,
    })
  } else {
    const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
    const row: EntryRow = {
      id: nextId,
      status: '待审核',
      pending: true,
      abnormal: false,
      记录编号: data.记录编号,
      站点编号: data.站点编号,
      采样时间: data.采样时间,
      含沙量,
      输沙率,
      颗粒级配: 颗粒级配 || '缺测',
      采样人: data.采样人,
      记录状态: '待审核',
      级配说明,
    }
    saveRows('sediment', [...rows, row])
    item = addReviewItem({
      sourceKey: 'sediment',
      sourceLabel: '泥沙监测',
      记录编号: data.记录编号,
      站点编号: data.站点编号,
      采样时间: data.采样时间,
      reason: '新增待审',
      detail: `新采样记录已提交待审核（含沙量 ${含沙量}、输沙率 ${输沙率}）`
        + (颗粒级配 ? '' : '；颗粒级配缺测，说明：' + 级配说明),
      status: '待核',
      createdAt: now,
    })
  }

  saveSedimentDraft({ ...claimed, state: 'submitted' })
  return {
    ok: true,
    message: official
      ? `「${data.记录编号}」与既有样本同号，已沿用原值并生成待核事项 #${item.id}`
      : `「${data.记录编号}」已提交待审核，并联动生成整编待核事项 #${item.id}`,
  }
}

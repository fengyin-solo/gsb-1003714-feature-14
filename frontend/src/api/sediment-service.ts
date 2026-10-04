import {
  readReviewItems,
  readStaging,
  writeReviewItems,
  writeStaging,
} from '@/data/sediment-staging'
import { listRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  EntryRow,
  ReviewItem,
  SedimentDraft,
  SedimentForm,
  SedimentStagingState,
} from '@/data/types'

const MODULE_KEY = 'sediment'
const RECORD_NO = '记录编号'

// 现场表单字段不设填写顺序，任何时刻都可以先落暂存区。
export const SEDIMENT_FORM_FIELDS: { key: keyof SedimentForm; label: string }[] = [
  { key: '记录编号', label: '记录编号' },
  { key: '站点编号', label: '站点编号' },
  { key: '采样时间', label: '采样时间' },
  { key: '含沙量', label: '含沙量（kg/m³）' },
  { key: '输沙率', label: '输沙率（kg/s）' },
  { key: '颗粒级配', label: '颗粒级配' },
  { key: '采样人', label: '采样人' },
]

// 含沙量、输沙率为零是真实测次，保留并放行，不因此标记异常。
const ZERO_TOLERATED_FIELDS: (keyof SedimentForm)[] = ['含沙量', '输沙率']

export function emptySedimentForm(): SedimentForm {
  return {
    记录编号: '',
    站点编号: '',
    采样时间: '',
    含沙量: '',
    输沙率: '',
    颗粒级配: '',
    采样人: '',
    级配缺失说明: '',
  }
}

// 纯展示用：数值字段是数字，其他字段是字符串。
export function formatField(row: EntryRow, field: string): string {
  const value = row[field]
  if (value === undefined || value === null || value === '') {
    return ''
  }
  return String(value)
}

function findFormalRow(recordNo: string): EntryRow | undefined {
  const keyword = recordNo.trim()
  return listRows(MODULE_KEY).find((row) => String(row[RECORD_NO] ?? '').trim() === keyword)
}

function mutateStaging(mutate: (state: SedimentStagingState) => void): SedimentStagingState {
  const state = readStaging()
  mutate(state)
  return writeStaging(state)
}

export function listDrafts(): SedimentDraft[] {
  return readStaging().drafts
}

export function getDraft(draftKey: string): SedimentDraft | undefined {
  return readStaging().drafts.find((draft) => draft.draftKey === draftKey)
}

export function getActiveDraft(): SedimentDraft | undefined {
  const state = readStaging()
  if (!state.activeDraftKey) {
    return undefined
  }
  return state.drafts.find((draft) => draft.draftKey === state.activeDraftKey)
}

// 新开一份现场记录：先生成暂存草稿，编辑器里逐字段补录，顺序不限。
export function createDraft(): SedimentDraft {
  const now = Date.now()
  const draft: SedimentDraft = {
    draftKey: `draft-${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
    submittedId: null,
    submittedAt: null,
    form: emptySedimentForm(),
  }
  mutateStaging((state) => {
    state.drafts.push(draft)
    state.activeDraftKey = draft.draftKey
  })
  return draft
}

export function resumeDraft(draftKey: string): SedimentDraft | undefined {
  mutateStaging((state) => {
    state.activeDraftKey = state.drafts.some((draft) => draft.draftKey === draftKey)
      ? draftKey
      : state.activeDraftKey
  })
  return getDraft(draftKey)
}

// 暂存冲突处理：同记录编号已存在暂存草稿时，以旧草稿为载体合并本次录入，
// 不另起炉灶产生两份草稿（旧样本/旧草稿沿用原值，不覆盖未改动字段）。
export function saveDraft(
  draftKey: string,
  form: SedimentForm,
): { ok: boolean; message: string; draft?: SedimentDraft } {
  const state = readStaging()
  const draft = state.drafts.find((item) => item.draftKey === draftKey)
  if (!draft) {
    return { ok: false, message: '暂存草稿已不存在，请重新登记' }
  }
  const recordNo = form[RECORD_NO].trim()
  if (recordNo) {
    const formal = findFormalRow(recordNo)
    if (formal) {
      // 顺着暂存→提交链路先看结论：已通过的记录不允许再暂存覆盖。
      if (String(formal.status) === '已通过') {
        return { ok: false, message: `记录编号 ${recordNo} 已存在并已通过，现场记录不可再编辑` }
      }
    }
    const other = state.drafts.find(
      (item) =>
        item.draftKey !== draftKey &&
        item.submittedId === null &&
        item.form[RECORD_NO].trim() === recordNo,
    )
    if (other) {
      // 旧草稿沿用原值：旧草稿已填的字段保持不动，只补上旧草稿还没填的字段。
      const incoming = Object.fromEntries(
        Object.entries(form).filter(
          ([key, value]) => other.form[key as keyof SedimentForm].trim() === '' && value.trim() !== '',
        ),
      ) as Partial<SedimentForm>
      const merged: SedimentDraft = {
        ...other,
        form: { ...other.form, ...incoming },
        updatedAt: Date.now(),
      }
      const nextState: SedimentStagingState = {
        drafts: state.drafts
          .filter((item) => item.draftKey !== draftKey)
          .map((item) => (item.draftKey === other.draftKey ? merged : item)),
        activeDraftKey: other.draftKey,
      }
      writeStaging(nextState)
      return {
        ok: true,
        message: `记录编号 ${recordNo} 已有暂存草稿，已并入原草稿继续编辑`,
        draft: merged,
      }
    }
  }
  const updated: SedimentDraft = { ...draft, form: { ...form }, updatedAt: Date.now() }
  const nextState: SedimentStagingState = {
    drafts: state.drafts.map((item) => (item.draftKey === draftKey ? updated : item)),
    activeDraftKey: state.activeDraftKey ?? draftKey,
  }
  writeStaging(nextState)
  return { ok: true, message: '已落入暂存区', draft: updated }
}

export function deleteDraft(draftKey: string): void {
  mutateStaging((state) => {
    state.drafts = state.drafts.filter((draft) => draft.draftKey !== draftKey)
    if (state.activeDraftKey === draftKey) {
      state.activeDraftKey = null
    }
  })
}

// 关闭编辑器：一个字都没录的空草稿顺手清掉；已经有内容的继续留在暂存区，随时回来续编。
export function closeEditor(): void {
  mutateStaging((state) => {
    state.drafts = state.drafts.filter((draft) => {
      if (draft.submittedId !== null) {
        return true
      }
      const hasContent = Object.values(draft.form).some((value) => value.trim() !== '')
      if (!hasContent && state.activeDraftKey === draft.draftKey) {
        return false
      }
      return true
    })
    state.activeDraftKey = null
  })
}

function validateSedimentForm(form: SedimentForm): string | null {
  const required: (keyof SedimentForm)[] = [
    '记录编号',
    '站点编号',
    '采样时间',
    '含沙量',
    '输沙率',
    '采样人',
  ]
  for (const field of required) {
    if (form[field].trim() === '') {
      return `请填写${field === '记录编号' ? '记录编号' : field}`
    }
  }
  for (const field of ZERO_TOLERATED_FIELDS) {
    const raw = form[field].trim()
    if (!/^\d+(\.\d+)?$/.test(raw)) {
      return `${field}需为不小于 0 的数值，零值按实测保留`
    }
  }
  if (form.颗粒级配.trim() === '' && form.级配缺失说明.trim() === '') {
    return '缺少颗粒级配时，必须保留缺测说明，便于整编核对'
  }
  return null
}

// 打开/暂存时顺着链路定位同编号正式记录：已通过即拦截，其他状态提示将沿用原记录。
export function inspectChain(form: SedimentForm): { passed: boolean; message: string } {
  const recordNo = form[RECORD_NO].trim()
  if (!recordNo) {
    return { passed: true, message: '' }
  }
  const formal = findFormalRow(recordNo)
  if (!formal) {
    return { passed: true, message: '' }
  }
  const status = String(formal.status)
  if (status === '已通过') {
    return { passed: false, message: `记录编号 ${recordNo} 已有「已通过」结论，不可再编辑或提交` }
  }
  return { passed: true, message: `记录编号 ${recordNo} 已在清单中（${status}），提交时沿用原记录` }
}

// 提交入口串行化：同一时刻只有一次提交能落库，其余并发提交直接拒绝。
let submitting = false

function buildEntryRow(id: number, form: SedimentForm, status: string): EntryRow {
  const gradeNote = form.级配缺失说明.trim()
  return {
    id,
    status,
    pending: status === '待审核',
    // 零值是正常测次，不触发异常；异常只能由审核人显式标记。
    abnormal: false,
    记录编号: form.记录编号.trim(),
    站点编号: form.站点编号.trim(),
    采样时间: form.采样时间.trim(),
    含沙量: Number(form.含沙量.trim()),
    输沙率: Number(form.输沙率.trim()),
    颗粒级配: form.颗粒级配.trim(),
    采样人: form.采样人.trim(),
    记录状态: status,
    ...(gradeNote ? { 级配缺失说明: gradeNote } : {}),
  }
}

export type SubmitOutcome = {
  ok: boolean
  message: string
  reused?: boolean
  row?: EntryRow
}

// 提交草稿：校验通过后进入待审核；已提交过的同草稿再次提交沿用第一次的正式记录，不重复生成。
export function submitDraft(draftKey: string, form: SedimentForm): SubmitOutcome {
  const state = readStaging()
  const draft = state.drafts.find((item) => item.draftKey === draftKey)
  if (!draft) {
    return { ok: false, message: '暂存草稿已不存在，请重新登记' }
  }
  if (draft.submittedId !== null) {
    const existing = listRows(MODULE_KEY).find((row) => Number(row.id) === draft.submittedId)
    if (existing) {
      return {
        ok: true,
        reused: true,
        row: existing,
        message: `该草稿已提交（编号 ${draft.submittedId}），沿用已有草稿记录，不重复提交`,
      }
    }
  }
  if (submitting) {
    return { ok: false, message: '上一笔提交尚未完成，并发提交只保留第一次有效草稿' }
  }
  const validationError = validateSedimentForm(form)
  if (validationError) {
    return { ok: false, message: validationError }
  }
  const recordNo = form[RECORD_NO].trim()
  const formal = findFormalRow(recordNo)
  if (formal) {
    const status = String(formal.status)
    if (status === '已通过') {
      return { ok: false, message: `记录编号 ${recordNo} 已有「已通过」结论，不能重复提交` }
    }
    // 旧样本沿用原值：清单里已存在同编号记录（待审核/异常值）时提示走原记录，不再新建。
    return {
      ok: true,
      reused: true,
      row: formal,
      message: `记录编号 ${recordNo} 已在清单中（${status}），沿用原记录，未重复落库`,
    }
  }

  // 前置校验全部通过后才上锁，避免失败请求占住并发闸门。
  submitting = true
  try {
    const rows = listRows(MODULE_KEY)
    const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
    const row = buildEntryRow(nextId, form, '待审核')
    saveRows(MODULE_KEY, [...rows, row])

    const now = Date.now()
    const updatedDraft: SedimentDraft = {
      ...draft,
      form: { ...form },
      submittedId: row.id,
      submittedAt: now,
      updatedAt: now,
    }
    writeStaging({
      drafts: state.drafts.map((item) => (item.draftKey === draftKey ? updatedDraft : item)),
      activeDraftKey: state.activeDraftKey,
    })

    // 提交即向整编入口联动生成待核事项；颗粒级配缺失、零值都会写进核对理由。
    syncSedimentReviewItems()
    return { ok: true, row, message: `现场记录已提交，编号 ${row.id}，进入待审核` }
  } finally {
    submitting = false
  }
}

function reviewReasons(row: EntryRow): string[] | null {
  const status = String(row.status)
  if (status === '已通过' || status === '已采集') {
    return null
  }
  const reasons = ['泥沙记录待整编核对']
  if (String(row.颗粒级配 ?? '').trim() === '') {
    const note = String(row.级配缺失说明 ?? '').trim()
    reasons.push(note ? `缺颗粒级配（说明：${note}）` : '缺颗粒级配')
  }
  const sediment = row.含沙量
  const transport = row.输沙率
  // 零值只生成核对提醒，不标记为异常。
  if ((typeof sediment === 'number' && sediment === 0) || String(sediment) === '0') {
    reasons.push('含沙量为零值，需核对')
  }
  if ((typeof transport === 'number' && transport === 0) || String(transport) === '0') {
    reasons.push('输沙率为零值，需核对')
  }
  if (status === '异常值') {
    reasons.push('记录已标记异常值，需复核')
  }
  return reasons
}

// 整编入口联动：对清单中的泥沙记录做一次全量对账。
// 待审核/异常值记录补生成待核事项（同记录只生成一次），已通过的自动核销，已删除的清理掉。
export function syncSedimentReviewItems(): { created: number; resolved: number } {
  const rows = listRows(MODULE_KEY)
  const stored = readReviewItems()
  const now = Date.now()
  const byId = new Map(stored.map((item) => [item.recordId, item]))
  let created = 0
  let resolved = 0

  for (const row of rows) {
    const reasons = reviewReasons(row)
    const existing = byId.get(Number(row.id))
    if (reasons === null) {
      if (existing && existing.status === '待核') {
        byId.set(Number(row.id), { ...existing, status: '已核', updatedAt: now })
        resolved += 1
      }
      continue
    }
    if (!existing) {
      byId.set(Number(row.id), {
        id: `${MODULE_KEY}:${row.id}`,
        sourceModule: MODULE_KEY,
        recordId: Number(row.id),
        记录编号: String(row[RECORD_NO] ?? ''),
        站点编号: String(row.站点编号 ?? ''),
        采样时间: String(row.采样时间 ?? ''),
        reasons,
        note: String(row.级配缺失说明 ?? ''),
        status: '待核',
        createdAt: now,
        updatedAt: now,
      })
      created += 1
    } else if (existing.status === '待核') {
      // 理由随记录现状刷新，仍保留同一条待核事项，不重复生成。
      byId.set(Number(row.id), { ...existing, reasons, updatedAt: now })
    }
  }

  const liveIds = new Set(rows.map((row) => Number(row.id)))
  const next = [...byId.values()].filter((item) => liveIds.has(item.recordId))
  next.sort((a, b) => b.createdAt - a.createdAt)
  writeReviewItems(next)
  return { created, resolved }
}

export function listReviewItems(): ReviewItem[] {
  return readReviewItems().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function reviewSummary(): { pending: number; resolved: number } {
  const items = readReviewItems()
  return {
    pending: items.filter((item) => item.status === '待核').length,
    resolved: items.filter((item) => item.status === '已核').length,
  }
}

// 通用动作（确认通过/标记异常）执行后，同步联动整编待核事项。
export function afterSedimentAction(result: ActionResult): ActionResult {
  if (result.ok) {
    syncSedimentReviewItems()
  }
  return result
}

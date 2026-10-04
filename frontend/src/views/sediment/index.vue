<template>
  <section class="page" data-module="sediment">
    <header class="page-head">
      <div>
        <h2>泥沙监测管理</h2>
        <p class="page-desc">现场记录先落暂存区，含沙量、输沙率、颗粒级配可不按固定顺序填写；刷新或重新进入后继续编辑，提交时走暂存→待审核→通过链路。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记泥沙监测记录</button>
        <button class="btn" type="button" @click="exportRows">导出泥沙监测清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <!-- 暂存区：现场记录未提交前都在这里，刷新页面也不丢。 -->
    <section class="staging-panel">
      <header class="staging-head">
        <h3>暂存区（{{ drafts.length }}）</h3>
        <span class="staging-tip">记录自动暂存，含沙量、输沙率、颗粒级配可任意顺序填写</span>
      </header>
      <ul v-if="drafts.length" class="staging-list">
        <li v-for="draft in drafts" :key="draft.draftKey" class="staging-item">
          <div class="staging-meta">
            <strong>{{ draft.form.记录编号.trim() || '未编号草稿' }}</strong>
            <span class="staging-sub">
              {{ draft.form.站点编号 || '站点待填' }} ·
              {{ draft.form.采样时间 || '时间待填' }} ·
              含沙量 {{ draft.form.含沙量 === '' ? '待填' : draft.form.含沙量 }} ·
              输沙率 {{ draft.form.输沙率 === '' ? '待填' : draft.form.输沙率 }} ·
              级配 {{ draft.form.颗粒级配 === '' ? '缺' : '已填' }}
            </span>
            <span v-if="draft.submittedId !== null" class="tag tag-done">已提交 #{{ draft.submittedId }}</span>
            <span v-else class="tag tag-draft">暂存中</span>
          </div>
          <div class="staging-ops">
            <button class="link" type="button" @click="resume(draft.draftKey)">继续编辑</button>
            <button
              v-if="draft.submittedId === null"
              class="link danger"
              type="button"
              @click="removeDraft(draft.draftKey)"
            >
              删除
            </button>
          </div>
        </li>
      </ul>
      <p v-else class="staging-empty">暂无暂存记录，点击「登记泥沙监测记录」开始现场录入</p>
    </section>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">
            <template v-if="column === '颗粒级配'">
              <template v-if="gradeCell(row).value">{{ gradeCell(row).value }}</template>
              <span v-else class="grade-missing" :title="gradeCell(row).note">
                缺测{{ gradeCell(row).note ? `（${gradeCell(row).note}）` : '' }}
              </span>
            </template>
            <template v-else-if="column === '含沙量' || column === '输沙率'">
              {{ displayNumeric(row, column) }}
            </template>
            <template v-else>{{ row[column] ?? '—' }}</template>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无泥沙监测数据，可先登记泥沙监测记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条泥沙监测记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <!-- 现场录入编辑器：不强制填写顺序，随手自动暂存。 -->
    <div v-if="editorOpen" class="modal-mask" @click.self="handleClose">
      <div class="modal">
        <header class="modal-head">
          <h3>{{ activeDraft?.submittedId !== null ? '查看已提交草稿' : '泥沙现场记录' }}</h3>
          <button class="link" type="button" @click="handleClose">关闭</button>
        </header>
        <p v-if="chainMessage" class="chain-tip" :class="{ 'chain-block': !chainPassed }">{{ chainMessage }}</p>
        <div class="form-grid">
          <label v-for="field in formFields" :key="field.key" class="form-item">
            <span>{{ field.label }}</span>
            <input
              v-model="form[field.key]"
              :disabled="formReadonly"
              :placeholder="field.label"
              @input="scheduleAutosave"
            />
          </label>
          <label class="form-item form-item-wide">
            <span>颗粒级配缺测说明（缺级配时必填，提交后随记录保留）</span>
            <textarea
              v-model="form.级配缺失说明"
              :disabled="formReadonly"
              rows="2"
              placeholder="例如：沙样量不足，级配待补测"
              @input="scheduleAutosave"
            ></textarea>
          </label>
        </div>
        <p class="zero-tip">说明：含沙量、输沙率为 0 按实测零值保留，不会触发异常。</p>
        <footer class="modal-foot">
          <template v-if="formReadonly">
            <span class="foot-hint">该草稿已提交，字段以正式记录为准</span>
            <button class="btn primary" type="button" :disabled="submitting" @click="submit">
              再次提交（沿用已有）
            </button>
          </template>
          <template v-else>
            <button class="btn" type="button" @click="manualSave">暂存</button>
            <button class="btn primary" type="button" :disabled="submitting" @click="submit">
              {{ submitting ? '提交中…' : '提交审核' }}
            </button>
          </template>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  afterSedimentAction,
  closeEditor,
  createDraft,
  deleteDraft,
  emptySedimentForm,
  getActiveDraft,
  getDraft,
  inspectChain,
  listDrafts,
  resumeDraft,
  saveDraft,
  SEDIMENT_FORM_FIELDS,
  submitDraft,
} from '@/api/sediment-service'
import type { EntryRow, SedimentDraft, SedimentForm } from '@/data/types'

const meta = moduleMeta('sediment')
const columns = ['记录编号', '站点编号', '采样时间', '含沙量', '输沙率', '颗粒级配', '采样人', '记录状态']
const actions = ['提交审核', '确认通过', '标记异常']
const statuses = ['已采集', '待审核', '已通过', '异常值']
const formFields = SEDIMENT_FORM_FIELDS

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

const drafts = ref<SedimentDraft[]>([])
const editorOpen = ref(false)
const form = ref<SedimentForm>(emptySedimentForm())
const currentDraftKey = ref<string | null>(null)
const activeDraft = ref<SedimentDraft | null>(null)
const submitting = ref(false)
const chainMessage = ref('')
const chainPassed = ref(true)
let autosaveTimer: ReturnType<typeof setTimeout> | undefined

const formReadonly = computed(() => activeDraft.value?.submittedId !== null)

const stats = computed(() => {
  const monthPrefix = new Date().toISOString().slice(0, 7)
  const monthCount = rows.value.filter((row) => String(row.采样时间 ?? '').startsWith(monthPrefix)).length
  return [
    { label: '本月采样次数', value: monthCount },
    { label: '待审核记录', value: rows.value.filter((row) => String(row.status) === '待审核').length },
    { label: '异常记录数', value: rows.value.filter((row) => row.abnormal).length },
  ]
})

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function gradeCell(row: EntryRow): { value: string; note: string } {
  return {
    value: String(row.颗粒级配 ?? '').trim(),
    note: String(row.级配缺失说明 ?? '').trim(),
  }
}

// 零值要看得见：空才显示 —，0 原样展示。
function displayNumeric(row: EntryRow, field: string): string {
  const value = row[field]
  if (value === undefined || value === null || value === '') {
    return '—'
  }
  return String(value)
}

function reloadDrafts() {
  drafts.value = listDrafts().sort((a, b) => b.updatedAt - a.updatedAt)
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openDraft(draft: SedimentDraft | undefined) {
  if (!draft) {
    return
  }
  currentDraftKey.value = draft.draftKey
  activeDraft.value = draft
  form.value = { ...draft.form }
  const chain = inspectChain(draft.form)
  chainMessage.value = chain.message
  chainPassed.value = chain.passed
  editorOpen.value = true
}

function openCreate() {
  errorMessage.value = ''
  openDraft(createDraft())
  reloadDrafts()
}

function resume(draftKey: string) {
  errorMessage.value = ''
  openDraft(resumeDraft(draftKey))
  reloadDrafts()
}

function removeDraft(draftKey: string) {
  deleteDraft(draftKey)
  reloadDrafts()
}

function scheduleAutosave() {
  if (formReadonly.value || !currentDraftKey.value) {
    return
  }
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
  }
  autosaveTimer = setTimeout(() => {
    persistDraft(false)
  }, 300)
}

function persistDraft(announce: boolean) {
  if (!currentDraftKey.value) {
    return
  }
  const result = saveDraft(currentDraftKey.value, form.value)
  if (!result.ok) {
    chainMessage.value = result.message
    chainPassed.value = false
    return
  }
  if (result.draft && result.draft.draftKey !== currentDraftKey.value) {
    // 同编号暂存冲突：已并入旧草稿，切换过去继续编辑。
    currentDraftKey.value = result.draft.draftKey
  }
  activeDraft.value = getDraft(currentDraftKey.value) ?? activeDraft.value
  form.value = { ...(activeDraft.value?.form ?? form.value) }
  const chain = inspectChain(form.value)
  chainMessage.value = announce || !chain.passed ? (chain.message || result.message) : chain.message
  chainPassed.value = chain.passed
  reloadDrafts()
}

function manualSave() {
  persistDraft(true)
}

function submit() {
  if (!currentDraftKey.value) {
    return
  }
  submitting.value = true
  const outcome = submitDraft(currentDraftKey.value, form.value)
  submitting.value = false
  chainMessage.value = outcome.message
  chainPassed.value = outcome.ok
  if (!outcome.ok) {
    return
  }
  activeDraft.value = getDraft(currentDraftKey.value) ?? activeDraft.value
  if (outcome.reused && String(outcome.row?.status) === '已通过') {
    chainMessage.value = outcome.message
    chainPassed.value = false
  }
  reloadDrafts()
  reload()
}

function handleClose() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
  }
  // 关窗前往暂存区再落一次，保证最后录入不丢。
  if (currentDraftKey.value && !formReadonly.value) {
    saveDraft(currentDraftKey.value, form.value)
  }
  closeEditor()
  editorOpen.value = false
  currentDraftKey.value = null
  activeDraft.value = null
  reloadDrafts()
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = afterSedimentAction(applyAction(meta.key, Number(row.id), action))
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '泥沙监测列表读取失败'
  }
  reloadDrafts()
}

onMounted(() => {
  reload()
  // 刷新或重新进入：自动找回暂存区里正在编辑的草稿，接着录。
  const active = getActiveDraft()
  if (active) {
    openDraft(active)
  }
})
</script>

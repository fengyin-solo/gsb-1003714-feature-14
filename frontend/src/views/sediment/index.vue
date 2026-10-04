<template>
  <section class="page" data-module="sediment">
    <header class="page-head">
      <div>
        <h2>泥沙监测管理</h2>
        <p class="page-desc">现场记录先落暂存区，含沙量、输沙率、颗粒级配可乱序补录，刷新或重进后继续编辑；提交后进入待审核并联动整编待核事项。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记现场记录</button>
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

    <section v-if="drafts.length" class="staging-panel">
      <header class="panel-head">
        <h3>暂存区（{{ drafts.length }}）</h3>
        <span class="panel-hint">记录暂存于本机浏览器，刷新或重新进入后可继续编辑；提交后才进入正式台账。</span>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th>记录编号</th>
            <th>站点编号</th>
            <th>采样时间</th>
            <th>含沙量</th>
            <th>输沙率</th>
            <th>颗粒级配</th>
            <th>采样人</th>
            <th>暂存时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="draft in drafts" :key="draft.记录编号">
            <td>{{ draft.记录编号 || '—' }}</td>
            <td>{{ draft.站点编号 || '—' }}</td>
            <td>{{ draft.采样时间 || '—' }}</td>
            <td>{{ draft.含沙量 === '' ? '待补' : draft.含沙量 }}</td>
            <td>{{ draft.输沙率 === '' ? '待补' : draft.输沙率 }}</td>
            <td>
              {{ draft.颗粒级配 || '缺测' }}
              <small v-if="!draft.颗粒级配 && draft.级配说明" class="cell-note">（{{ draft.级配说明 }}）</small>
            </td>
            <td>{{ draft.采样人 || '—' }}</td>
            <td>{{ formatTime(draft.updatedAt) }}</td>
            <td class="row-actions">
              <button class="link" type="button" @click="openEdit(draft)">继续编辑</button>
              <button class="link" type="button" @click="submitDraft(draft.记录编号)">提交</button>
              <button class="link danger" type="button" @click="discardDraft(draft.记录编号)">丢弃</button>
            </td>
          </tr>
        </tbody>
      </table>
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
            {{ row[column] ?? '—' }}
            <small v-if="column === '颗粒级配' && row['级配说明']" class="cell-note">（{{ row['级配说明'] }}）</small>
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
          <td :colspan="columns.length + 2" class="empty-state">暂无泥沙监测数据，可先登记现场记录并提交</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条泥沙监测记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="editing" class="modal-mask" @click.self="closeEditor">
      <div class="modal-card">
        <header class="modal-head">
          <h3>{{ isNew ? '登记现场记录' : '继续编辑暂存记录' }}</h3>
          <button class="link" type="button" @click="closeEditor">关闭</button>
        </header>
        <p class="panel-hint">先落暂存再提交：含沙量、输沙率、颗粒级配可按任意顺序补录；0 是合法实测值；颗粒级配缺测须填写说明。</p>
        <form class="field-form" @submit.prevent>
          <label class="field-item">
            <span>记录编号 <em>*</em></span>
            <input v-model="editing.记录编号" :disabled="!isNew" placeholder="如 SEDI-0007" />
          </label>
          <label class="field-item">
            <span>站点编号 <em>*</em></span>
            <input v-model="editing.站点编号" placeholder="如 STAT-0001" />
          </label>
          <label class="field-item">
            <span>采样时间 <em>*</em></span>
            <input v-model="editing.采样时间" type="datetime-local" />
          </label>
          <label class="field-item">
            <span>含沙量（kg/m³）</span>
            <input v-model="editing.含沙量" type="number" min="0" step="any" placeholder="可留空后补，0 合法" />
          </label>
          <label class="field-item">
            <span>输沙率（kg/s）</span>
            <input v-model="editing.输沙率" type="number" min="0" step="any" placeholder="可留空后补，0 合法" />
          </label>
          <label class="field-item">
            <span>颗粒级配</span>
            <input v-model="editing.颗粒级配" placeholder="如 中砂40%/细砂35%/粉砂25%" />
          </label>
          <label class="field-item">
            <span>采样人 <em>*</em></span>
            <input v-model="editing.采样人" />
          </label>
          <label class="field-item field-wide">
            <span>级配说明 <em v-if="!editing.颗粒级配">缺级配时必填 *</em></span>
            <textarea v-model="editing.级配说明" rows="2" placeholder="颗粒级配缺测时保留原因，如：级配样品损坏，下月补测"></textarea>
          </label>
        </form>
        <footer class="modal-foot">
          <span v-if="editorMessage" :class="editorOk ? 'ok-text' : 'error-text'">{{ editorMessage }}</span>
          <div class="modal-actions">
            <button class="btn ghost" type="button" @click="closeEditor">取消</button>
            <button class="btn" type="button" @click="saveToStaging">存入暂存区</button>
            <button class="btn primary" type="button" @click="saveAndSubmit">暂存并提交</button>
          </div>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  discardDraft as discardStagedDraft,
  emptySedimentForm,
  listStagedDrafts,
  stageDraft,
  submitDraft as submitStagedDraft,
} from '@/api/sediment-service'
import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow, SedimentDraftData } from '@/data/types'

const meta = moduleMeta('sediment')
const columns = ["记录编号", "站点编号", "采样时间", "含沙量", "输沙率", "颗粒级配", "采样人", "记录状态"]
const actions = ["提交审核", "确认通过", "标记异常"]
const statuses = ["已采集", "待审核", "已通过", "异常值"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)

const drafts = ref(listStagedDrafts())
const editing = ref<SedimentDraftData | null>(null)
const isNew = ref(true)
const editorMessage = ref('')
const editorOk = ref(true)

const stats = computed(() => {
  const monthPrefix = new Date().toISOString().slice(0, 7)
  return [
    { label: "本月采样次数", value: rows.value.filter((row) => String(row["采样时间"]).startsWith(monthPrefix)).length },
    { label: "暂存草稿", value: drafts.value.length },
    { label: "待审核记录", value: rows.value.filter((row) => String(row.status) === "待审核").length },
    { label: "异常记录数", value: rows.value.filter((row) => row.abnormal).length },
  ]
})

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false })
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  editing.value = emptySedimentForm()
  isNew.value = true
  editorMessage.value = ''
}

function openEdit(draft: SedimentDraftData) {
  editing.value = { ...draft }
  isNew.value = false
  editorMessage.value = ''
}

function closeEditor() {
  editing.value = null
  editorMessage.value = ''
  reloadDrafts()
}

function saveToStaging() {
  if (!editing.value) {
    return
  }
  const result = stageDraft(editing.value)
  editorOk.value = result.ok
  editorMessage.value = result.message
  if (result.ok) {
    reloadDrafts()
  }
}

function saveAndSubmit() {
  if (!editing.value) {
    return
  }
  const staged = stageDraft(editing.value)
  if (!staged.ok) {
    editorOk.value = false
    editorMessage.value = staged.message
    return
  }
  const code = editing.value.记录编号.trim()
  const result = submitStagedDraft(code)
  editorOk.value = result.ok
  editorMessage.value = result.message
  reloadDrafts()
  if (result.ok) {
    reload()
    editing.value = null
  }
}

function submitDraft(code: string) {
  const result = submitStagedDraft(code)
  errorMessage.value = result.ok ? '' : result.message
  reloadDrafts()
  reload()
}

function discardDraft(code: string) {
  const result = discardStagedDraft(code)
  errorMessage.value = result.ok ? '' : result.message
  reloadDrafts()
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reloadDrafts() {
  drafts.value = listStagedDrafts()
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
}

onMounted(reload)
</script>

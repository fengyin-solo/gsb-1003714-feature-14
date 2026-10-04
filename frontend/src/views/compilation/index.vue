<template>
  <section class="page" data-module="compilation">
    <header class="page-head">
      <div>
        <h2>数据整编管理</h2>
        <p class="page-desc">维护整编成果，围绕成果编号、整编年份、站点编号、整编类型做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记整编成果</button>
        <button class="btn" type="button" @click="exportRows">导出数据整编清单</button>
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

    <!-- 整编入口联动：对泥沙记录生成待核事项，已通过的自动核销。 -->
    <section class="review-panel">
      <header class="staging-head">
        <h3>待核事项（泥沙联动）</h3>
        <div class="staging-ops">
          <button class="btn" type="button" @click="syncReviews">联动生成待核事项</button>
        </div>
      </header>
      <p class="staging-tip">
        待核 {{ reviewStats.pending }} 项 · 已核 {{ reviewStats.resolved }} 项
        <span v-if="syncMessage" class="sync-msg">{{ syncMessage }}</span>
      </p>
      <table v-if="reviewItems.length" class="data-table review-table">
        <thead>
          <tr>
            <th>来源记录</th>
            <th>站点编号</th>
            <th>采样时间</th>
            <th>核对要点</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in reviewItems" :key="item.id">
            <td>{{ item.记录编号 }}（#{{ item.recordId }}）</td>
            <td>{{ item.站点编号 }}</td>
            <td>{{ item.采样时间 }}</td>
            <td>
              <span v-for="reason in item.reasons" :key="reason" class="reason-tag">{{ reason }}</span>
              <span v-if="item.note" class="reason-note">缺测说明：{{ item.note }}</span>
            </td>
            <td>{{ item.status }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="staging-empty">暂无待核事项，点击「联动生成待核事项」按泥沙记录对账</p>
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
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
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
          <td :colspan="columns.length + 2" class="empty-state">暂无数据整编数据，可先登记整编成果</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条数据整编记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
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
  listReviewItems,
  reviewSummary,
  syncSedimentReviewItems,
} from '@/api/sediment-service'
import type { EntryRow, ReviewItem } from '@/data/types'

const meta = moduleMeta('compilation')
const columns = ["成果编号", "整编年份", "站点编号", "整编类型", "原始记录数", "整编人", "审核人", "整编状态"]
const actions = ["开始整编", "提交审核", "驳回整编"]
const statuses = ["待整编", "整编中", "待审核", "已刊印", "已驳回"]
const stats = [{"label": "待整编年度", "value": 0}, {"label": "整编中年度", "value": 0}, {"label": "已刊印成果", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const reviewItems = ref<ReviewItem[]>([])
const reviewStats = ref({ pending: 0, resolved: 0 })
const syncMessage = ref('')

function reloadReviews() {
  reviewItems.value = listReviewItems()
  reviewStats.value = reviewSummary()
}

function syncReviews() {
  const result = syncSedimentReviewItems()
  syncMessage.value = `已联动：新增 ${result.created} 项待核，核销 ${result.resolved} 项`
  reloadReviews()
}
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '整编成果登记入口尚未接入审批流'
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

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '数据整编列表读取失败'
  }
  reloadReviews()
}

onMounted(() => {
  reload()
  // 进入整编入口即与泥沙记录对账一次，待核事项自动联动生成。
  const result = syncSedimentReviewItems()
  syncMessage.value = `已联动：新增 ${result.created} 项待核，核销 ${result.resolved} 项`
  reloadReviews()
})
</script>

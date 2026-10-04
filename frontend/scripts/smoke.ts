// 临时冒烟脚本：验证暂存、零值、级配缺测、幂等提交、冲突合并、待核联动。
const store = new Map<string, string>()
;(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
}

import {
  closeEditor,
  createDraft,
  deleteDraft,
  emptySedimentForm,
  getActiveDraft,
  inspectChain,
  listDrafts,
  listReviewItems,
  resumeDraft,
  saveDraft,
  submitDraft,
  syncSedimentReviewItems,
} from '../src/api/sediment-service'
import { listRows } from '../src/data/local-store'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass += 1
    console.log(`PASS ${name}`)
  } else {
    fail += 1
    console.error(`FAIL ${name} ${extra}`)
  }
}

function fill(over: Partial<ReturnType<typeof emptySedimentForm>>) {
  return { ...emptySedimentForm(), ...over }
}

// 1. 建草稿、不按顺序填字段、自动暂存
const d1 = createDraft()
saveDraft(d1.draftKey, fill({ 含沙量: '0' }))
saveDraft(d1.draftKey, fill({ 含沙量: '0', 输沙率: '0' }))
saveDraft(d1.draftKey, fill({ 含沙量: '0', 输沙率: '0', 记录编号: 'SEDI-T1', 站点编号: 'ST-1', 采样时间: '2026-10-04', 采样人: '张三', 颗粒级配: '' }))
check('暂存草稿数量为1', listDrafts().length === 1)
check('活跃草稿可恢复', getActiveDraft()?.draftKey === d1.draftKey)

// 2. 缺级配且无说明 → 提交拦截
let r = submitDraft(d1.draftKey, listDrafts()[0].form)
check('缺级配无说明被拦截', !r.ok && r.message.includes('缺测说明'), r.message)

// 3. 补说明后提交；零值保留、不异常
saveDraft(d1.draftKey, fill({
  记录编号: 'SEDI-T1', 站点编号: 'ST-1', 采样时间: '2026-10-04',
  含沙量: '0', 输沙率: '0', 采样人: '张三', 颗粒级配: '', 级配缺失说明: '沙样不足，待补测',
}))
r = submitDraft(d1.draftKey, listDrafts()[0].form)
check('带缺测说明提交成功', r.ok && !r.reused, r.message)
const row1 = listRows('sediment').find((x) => String(x.记录编号) === 'SEDI-T1')!
check('零值原样落库', row1.含沙量 === 0 && row1.输沙率 === 0)
check('零值不触发异常', row1.abnormal === false)
check('状态为待审核', String(row1.status) === '待审核')
check('缺测说明保留', String(row1.级配缺失说明) === '沙样不足，待补测')

// 4. 同草稿再次提交 → 沿用，不重复
r = submitDraft(d1.draftKey, listDrafts()[0].form)
check('再次提交幂等沿用', r.ok && r.reused === true, r.message)
check('清单未重复增加', listRows('sediment').filter((x) => String(x.记录编号) === 'SEDI-T1').length === 1)

// 5. 链路检查：对已存在编号再起草（已提交草稿不参与暂存合并，新草稿独立保留）
closeEditor()
const d2 = createDraft()
saveDraft(d2.draftKey, fill({ 记录编号: 'SEDI-T1' }))
check('已提交草稿不被并入', listDrafts().some((x) => x.draftKey === d1.draftKey) && listDrafts().some((x) => x.draftKey === d2.draftKey))
const chain = inspectChain(listDrafts().find((x) => x.draftKey === d2.draftKey)!.form)
check('链路能定位到已有记录', chain.passed && chain.message.includes('待审核'), chain.message)
deleteDraft(d2.draftKey)

// 6. 暂存冲突：全新编号先建一份，再用同编号新草稿保存 → 并入旧草稿、旧值保留
const dBase = createDraft()
saveDraft(dBase.draftKey, fill({ 记录编号: 'SEDI-DUP', 站点编号: 'ST-1' }))
const d3 = createDraft()
const merge = saveDraft(d3.draftKey, fill({ 记录编号: 'SEDI-DUP', 站点编号: 'ST-9' }))
check('同编号暂存冲突并入旧草稿', merge.ok && merge.draft?.draftKey === dBase.draftKey, merge.message)
check('被并入的草稿删除', !listDrafts().some((x) => x.draftKey === d3.draftKey))
check('旧草稿原值保留(站点仍是ST-1)', listDrafts().find((x) => x.draftKey === dBase.draftKey)!.form.站点编号 === 'ST-1')
deleteDraft(dBase.draftKey)

// 7. 新建正常含级配记录并提交
const d4 = createDraft()
saveDraft(d4.draftKey, fill({
  记录编号: 'SEDI-T2', 站点编号: 'ST-2', 采样时间: '2026-10-04',
  含沙量: '1.25', 输沙率: '3.4', 采样人: '李四', 颗粒级配: 'D50=0.02mm',
}))
r = submitDraft(d4.draftKey, listDrafts().find((x) => x.draftKey === d4.draftKey)!.form)
check('正常记录提交成功', r.ok && !r.reused, r.message)

// 8. 待核事项联动
const items = listReviewItems()
const t1Item = items.find((i) => i.记录编号 === 'SEDI-T1')!
check('缺级配记录生成待核事项', !!t1Item && t1Item.status === '待核')
check('待核理由含缺级配与零值', t1Item.reasons.some((x) => x.includes('缺颗粒级配')) && t1Item.reasons.some((x) => x.includes('零值')))
const t2Item = items.find((i) => i.记录编号 === 'SEDI-T2')!
check('普通待审核也生成待核事项', !!t2Item && !t2Item.reasons.some((x) => x.includes('缺颗粒级配')))

// 9. 确认通过后联动核销（走通用动作）
const { runAction } = await import('../src/api/local-service')
const { afterSedimentAction } = await import('../src/api/sediment-service')
afterSedimentAction(runAction('sediment', row1.id, '确认通过'))
check('通过后待核事项核销', listReviewItems().find((i) => i.记录编号 === 'SEDI-T1')!.status === '已核')

// 10. 已通过记录再次提交/暂存都被拦截
r = submitDraft(d1.draftKey, listDrafts().find((x) => x.draftKey === d1.draftKey)!.form)
check('已通过结论再次提交沿用原记录', r.reused === true && r.message.includes('沿用'), r.message)
const d5 = createDraft()
const d5Saved = saveDraft(d5.draftKey, fill({
  记录编号: 'SEDI-T1', 站点编号: 'ST-1', 采样时间: '2026-10-04',
  含沙量: '5', 输沙率: '6', 采样人: '王五', 颗粒级配: 'x',
}))
check('新草稿暂存撞已通过结论即拦截', d5Saved.ok === false && d5Saved.message.includes('已通过'), d5Saved.message)

// 11. 负数/非数字不允许
const d6 = createDraft()
saveDraft(d6.draftKey, fill({
  记录编号: 'SEDI-T3', 站点编号: 'ST-3', 采样时间: '2026-10-04',
  含沙量: '-1', 输沙率: '0', 采样人: '赵六', 颗粒级配: 'x',
}))
r = submitDraft(d6.draftKey, listDrafts().find((x) => x.draftKey === d6.draftKey)!.form)
check('负值被拦截', !r.ok && r.message.includes('数值'), r.message)

// 12. 关闭编辑器不清有内容草稿；空草稿清理
deleteDraft(d5.draftKey)
closeEditor()
check('关闭后有内容草稿仍在', listDrafts().some((x) => x.draftKey === d6.draftKey))
const d7 = createDraft()
check('新空草稿存在', listDrafts().some((x) => x.draftKey === d7.draftKey))
closeEditor()
check('空草稿关闭时清理', !listDrafts().some((x) => x.draftKey === d7.draftKey))

// 13. resume 恢复激活
resumeDraft(d6.draftKey)
check('resume 恢复激活草稿', getActiveDraft()?.draftKey === d6.draftKey)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

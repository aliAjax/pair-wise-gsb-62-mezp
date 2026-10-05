import type {
  Anomaly,
  AnomalyBranch,
  AnomalyChangeKind,
  AnomalyChangePayload,
  AuditEntry,
  ConflictField,
  FieldConflict,
  MergeReport,
  OutboxItem,
  Threshold,
  VersionBasis
} from './models'

/** 唯一编号与时间统一由调用方注入，保证合并逻辑为纯函数，便于复核与测试 */
export interface IdClock {
  id: (prefix: string) => string
  now: () => string
}

export const FIELD_LABELS: Record<ConflictField, string> = {
  status: '异常状态',
  observedValue: '观测值/速率描述',
  'plan.action': '处置措施',
  'plan.owner': '责任方',
  'plan.deadline': '截止时间',
  'plan.conditions': '关闭条件',
  'plan.emergencyLinked': '应急联动',
  'plan.approval': '签批结论'
}

const asDigest = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '∅'
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

const readField = (anomaly: Anomaly, field: ConflictField): unknown => {
  if (field === 'plan.approval') return anomaly.plan.approvedBy ? `${anomaly.plan.approvedBy}@${anomaly.plan.approvedAt}` : ''
  if (field.startsWith('plan.')) return anomaly.plan[field.slice(5) as keyof typeof anomaly.plan]
  return anomaly[field as 'status' | 'observedValue']
}

const writeField = (anomaly: Anomaly, field: ConflictField, value: unknown): void => {
  if (field === 'plan.approval') {
    const parsed = typeof value === 'string' && value.includes('@') ? value.split('@') : []
    anomaly.plan.approvedBy = parsed[0] ?? ''
    anomaly.plan.approvedAt = parsed[1] ?? ''
    return
  }
  if (field.startsWith('plan.')) {
    ;(anomaly.plan as unknown as Record<string, unknown>)[field.slice(5)] = value
    return
  }
  ;(anomaly as unknown as Record<string, unknown>)[field] = value
}

/** 每种改动会触及的可冲突标量字段；现场复核、意见属追加集合，不在此列 */
const FIELDS_BY_KIND: Record<AnomalyChangeKind, ConflictField[]> = {
  fieldReview: ['status'],
  opinion: [],
  savePlan: ['plan.action', 'plan.owner', 'plan.deadline', 'plan.conditions'],
  approve: ['plan.approval'],
  close: ['status'],
  emergency: ['plan.emergencyLinked', 'status']
}

/**
 * 将一次改动应用到异常快照（副本）。用于：
 * 1) 值班台直接编辑正本；2) 合并时构造“晚到版本假设值”做三方比对。
 */
export function applyChange(anomaly: Anomaly, kind: AnomalyChangeKind, payload: AnomalyChangePayload): Anomaly {
  const next = structuredClone(anomaly)
  switch (kind) {
    case 'fieldReview':
      if (payload.review) {
        next.fieldReviews.unshift({ ...payload.review, version: anomaly.fieldReviews.length + 1 })
        next.status = '原因调查中'
      }
      break
    case 'opinion':
      if (payload.opinion) next.opinions.unshift(payload.opinion)
      break
    case 'savePlan':
      if (payload.plan) {
        next.plan = { ...payload.plan, approvedBy: '', approvedAt: '' }
        next.status = '待负责人审批'
        next.reconfirmRequired = false
      }
      break
    case 'approve':
      next.plan.approvedBy = payload.approver ?? '值班负责人'
      next.plan.approvedAt = ''
      break
    case 'close':
      next.status = '已关闭'
      next.closedAt = ''
      break
    case 'emergency':
      next.plan.emergencyLinked = true
      next.status = '应急联动'
      break
  }
  return next
}

/** 补全审批时间/关闭时间等服务端语义时间戳 */
export function stampApplied(anomaly: Anomaly, kind: AnomalyChangeKind, now: string): void {
  if (kind === 'approve' && !anomaly.plan.approvedAt) anomaly.plan.approvedAt = now
  if (kind === 'close' && !anomaly.closedAt) anomaly.closedAt = now
}

function pushRevision(anomaly: Anomaly, changedBy: string, stationId: string, note: string, now: string): void {
  const snapshot = structuredClone(anomaly)
  anomaly.revisions.unshift({
    version: anomaly.version,
    snapshot,
    changedBy,
    stationId,
    changedAt: now,
    note
  })
}

function buildBranch(item: { kind: AnomalyChangeKind; payload: AnomalyChangePayload; stationId: string; stationName: string }, base: Anomaly, reason: AnomalyBranch['reason'], clock: IdClock): AnomalyBranch {
  const operator =
    item.payload.review?.inspector ??
    item.payload.opinion?.specialist ??
    item.payload.approver ??
    item.stationName
  return {
    id: clock.id('BR'),
    sourceVersion: base.version,
    kind: item.kind,
    payload: structuredClone(item.payload),
    stationId: item.stationId,
    stationName: item.stationName,
    operator,
    reason,
    createdAt: clock.now()
  }
}

export interface MergeOutcome {
  anomaly?: Anomaly
  report: Omit<MergeReport, 'id' | 'at' | 'anomalyId' | 'anomalyTitle' | 'itemId' | 'stationId' | 'stationName' | 'kind'>
  conflicts: FieldConflict[]
  branch?: AnomalyBranch
}

/**
 * 三方合并晚到的本地待办。
 * - base：待办生成时所依据的版本；console：值班台当前正本；incoming 假设值由 base+待办得到。
 * - 晚到记录不得覆盖已签批方案（savePlan 遇到 approvedBy 直接拒绝，保留待办与分支）。
 * - 同一标量字段两边都改且不一致：两个版本都保留（分支），列入字段冲突待交接。
 * - 仅一边改动的字段安全并入；现场复核与专业意见按集合追加，不互相覆盖。
 */
export function mergeIncomingChange(base: Anomaly, console: Anomaly, item: OutboxItem, clock: IdClock): MergeOutcome {
  const station = { kind: item.kind, payload: item.payload, stationId: item.stationId, stationName: item.stationName }

  // 已签批方案保护：晚到的改方案请求不能盖掉签批结论
  if (item.kind === 'savePlan' && console.plan.approvedBy) {
    return {
      report: {
        result: '已拒绝(签批保护)',
        detail: `值班台方案已由 ${console.plan.approvedBy} 签批，晚到的“${item.payload.plan?.action ?? ''}”方案保留为待交接版本，不覆盖正本。`
      },
      conflicts: [],
      branch: buildBranch(station, base, '已签批方案保护', clock)
    }
  }

  const incoming = applyChange(base, item.kind, item.payload)
  const watched = FIELDS_BY_KIND[item.kind]
  const conflicts: FieldConflict[] = []
  const merged = structuredClone(console)
  let divergent = false

  for (const field of watched) {
    const baseValue = asDigest(readField(base, field))
    const consoleValue = asDigest(readField(console, field))
    const incomingValue = asDigest(readField(incoming, field))
    if (consoleValue !== incomingValue) {
      // 两边都改过（都不同于 base）才登记字段冲突；仅一边改则安全并入
      const consoleChanged = consoleValue !== baseValue
      const incomingChanged = incomingValue !== baseValue
      if (consoleChanged && incomingChanged) {
        divergent = true
        conflicts.push({
          id: clock.id('CF'),
          branchId: '',
          field,
          baseDigest: baseValue,
          consoleDigest: consoleValue,
          incomingDigest: incomingValue,
          incomingStation: item.stationName,
          status: '待交接',
          chosenSide: '',
          resolvedAt: ''
        })
        // 正本保留值班台值，不取晚到值
      } else if (incomingChanged) {
        writeField(merged, field, readField(incoming, field))
      }
    }
  }

  // 追加类集合：两边各自新增的复核/意见都保留，按编号去重
  for (const review of incoming.fieldReviews) {
    if (!merged.fieldReviews.some((existing) => existing.id === review.id)) merged.fieldReviews.unshift(review)
  }
  for (const opinion of incoming.opinions) {
    if (!merged.opinions.some((existing) => existing.id === opinion.id)) merged.opinions.unshift(opinion)
  }

  const branch = divergent ? buildBranch(station, base, '双方修改', clock) : undefined
  if (branch) conflicts.forEach((conflict) => (conflict.branchId = branch.id))

  stampApplied(merged, item.kind, clock.now())
  merged.version = console.version + 1
  const operator = item.payload.review?.inspector ?? item.payload.opinion?.specialist ?? item.stationName
  pushRevision(merged, operator, item.stationId, divergent ? '合并晚到版本，存在字段冲突待交接' : '合并晚到本地待办', clock.now())

  return {
    anomaly: merged,
    conflicts,
    branch,
    report: divergent
      ? {
          result: '冲突待交接',
          detail: `字段 ${conflicts.map((conflict) => FIELD_LABELS[conflict.field]).join('、')} 两边都已修改，值班台版本保留为正本，晚到版本已留存，待值班负责人交接选择。`
        }
      : {
          result: '已合并',
          detail: `晚到“${kindLabel(item.kind)}”与值班台正本无冲突，已并入 V${merged.version}。`
        }
  }
}

export const kindLabel = (kind: AnomalyChangeKind): string => ({
  fieldReview: '现场复核',
  opinion: '专业意见',
  savePlan: '处置方案',
  approve: '方案签批',
  close: '关闭异常',
  emergency: '应急联动'
}[kind])

/** 交接时采用某一侧的冲突值，写回正本并解除该字段交接 */
export function resolveConflict(anomaly: Anomaly, conflictId: string, side: 'console' | 'incoming', clock: IdClock): Anomaly {
  const conflict = anomaly.conflicts.find((item) => item.id === conflictId)
  if (!conflict || conflict.status === '已解决') return anomaly
  const branch = anomaly.branches.find((item) => item.id === conflict.branchId)
  const next = structuredClone(anomaly)
  if (side === 'incoming' && branch) {
    const baseRevision = next.revisions.find((revision) => revision.version === branch.sourceVersion)?.snapshot
    const base = baseRevision ?? structuredClone(next)
    const incoming = applyChange(base, branch.kind, branch.payload)
    writeField(next, conflict.field, readField(incoming, conflict.field))
  }
  const target = next.conflicts.find((item) => item.id === conflictId)!
  target.status = '已解决'
  target.chosenSide = side
  target.resolvedAt = clock.now()
  next.version += 1
  pushRevision(next, '值班负责人', 'ST-CONSOLE', `字段交接：${FIELD_LABELS[conflict.field]} 采用${side === 'console' ? '值班台版本' : '晚到版本'}`, clock.now())
  return next
}

/**
 * 阈值升版重算。
 * - 未结案异常：按新版重算标记，要求重新确认（已填方案回到待审批，签批冻结）。
 * - 已结案异常：依据版本冻结，证据继续按原版查看。
 */
export function recalcOnThresholdPublish(anomaly: Anomaly, threshold: Threshold, clock: IdClock): Anomaly {
  const next = structuredClone(anomaly)
  if (next.status === '已关闭') {
    next.recalcNote = `已结案，阈值依据冻结在 V${next.basisThresholdVersion}，证据按原版查看。`
    return next
  }
  const before = `${next.basisThresholdVersion}`
  next.basisThresholdId = threshold.id
  next.basisThresholdVersion = threshold.version
  next.reconfirmRequired = true
  next.recalcNote = `阈值已由 V${before} 升至 V${threshold.version}（预警 ${threshold.warning} / 报警 ${threshold.alarm} / 速率 ${threshold.changeRate} ${threshold.unit}），请按新版重新确认。`
  if (next.plan.approvedBy) {
    next.plan.approvedBy = ''
    next.plan.approvedAt = ''
    next.status = '待负责人审批'
  }
  pushRevision(next, '阈值引擎', 'ST-CONSOLE', next.recalcNote, clock.now())
  return next
}

/** 按当前阈值重算测点状态（升版发布后调用） */
export function recalcPointStatus(currentValue: number, threshold?: Threshold): '正常' | '预警' | '异常' {
  if (!threshold || !threshold.enabled) return '正常'
  if (currentValue >= threshold.alarm) return '异常'
  if (currentValue >= threshold.warning) return '预警'
  return '正常'
}

/** 解析异常当前“版本依据”；已结案永远取结案时冻结的旧版阈值 */
export function resolveVersionBasis(anomaly: Anomaly, current: Threshold[], history: Record<string, Threshold[]>): VersionBasis {
  const frozen = anomaly.status === '已关闭'
  const source = frozen
    ? [...(history[anomaly.basisThresholdId] ?? []), ...current].find((item) => item.id === anomaly.basisThresholdId && item.version === anomaly.basisThresholdVersion)
    : current.find((item) => item.id === anomaly.basisThresholdId)
  const threshold = source ?? current.find((item) => item.type === anomaly.title)
  if (threshold) {
    return {
      thresholdId: threshold.id,
      type: threshold.type,
      version: anomaly.basisThresholdVersion,
      warning: threshold.warning,
      alarm: threshold.alarm,
      changeRate: threshold.changeRate,
      unit: threshold.unit,
      frozen,
      source: frozen ? `结案冻结依据 V${anomaly.basisThresholdVersion}` : `现行阈值 V${threshold.version}`
    }
  }
  return {
    thresholdId: anomaly.basisThresholdId,
    type: '位移',
    version: anomaly.basisThresholdVersion,
    warning: 0,
    alarm: 0,
    changeRate: 0,
    unit: '',
    frozen,
    source: '阈值版本缺失'
  }
}

export const makeAudit = (clock: IdClock) => (entityId: string, action: string, operator: string, detail: string): AuditEntry => ({
  id: clock.id('AUD'),
  entityId,
  action,
  operator,
  detail,
  createdAt: clock.now()
})

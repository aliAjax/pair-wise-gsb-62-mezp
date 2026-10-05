import { createActionGroup, emptyProps, props } from '@ngrx/store'
import type { Anomaly, AuditEntry, DispositionPlan, ExpertOpinion, FieldConflict, FieldReview, TailingsDataset, Threshold } from '../domain'

export const TailingsActions = createActionGroup({
  source: 'Tailings',
  events: {
    'Load Dataset': emptyProps(),
    'Load Dataset Success': props<{ dataset: TailingsDataset }>(),
    'Load Dataset Failure': props<{ error: string }>(),
    'Submit Field Review': props<{ anomalyId: string; review: FieldReview }>(),
    'Add Expert Opinion': props<{ anomalyId: string; opinion: ExpertOpinion }>(),
    'Save Disposition Plan': props<{ anomalyId: string; plan: DispositionPlan }>(),
    'Approve Plan': props<{ anomalyId: string; approver: string; note: string }>(),
    'Close Anomaly': props<{ anomalyId: string; note: string }>(),
    'Create Emergency Link': props<{ anomalyId: string; note: string }>(),
    'Select Anomaly': props<{ anomalyId: string }>(),
    'Update Keyword': props<{ keyword: string }>(),
    'Update Status': props<{ status: string }>(),
    'Add Audit': props<{ entry: AuditEntry }>(),
    'Reset Demo': emptyProps(),

    /** 离线/在线切换：离线时处置进入本地待办，在线后可与值班台合并、继续重试上报 */
    'Toggle Online': emptyProps(),
    'Set Online': props<{ online: boolean }>(),
    /** 与值班台合并：传入值班台侧的异常版本（模拟另一值班台同时修改） */
    'Merge Station Changes': props<{ anomalyId: string; station: Anomaly; stationOperator: string }>(),
    /** 冲突逐字段交接 */
    'Resolve Conflict': props<{ anomalyId: string; conflictKey: FieldConflict['key']; resolution: 'local' | 'station' }>(),
    /** 发布阈值新版：未结案异常重算并重新确认 */
    'Publish Threshold': props<{ threshold: Threshold }>(),
    /** 值班对重算结果重新确认 */
    'Reconfirm Recalc': props<{ anomalyId: string; operator: string; note: string }>(),

    /** 本地待办上报：单条重试 / 全部重试（恢复网络后继续重试） */
    'Retry Outbox Item': props<{ id: string }>(),
    'Retry All Outbox': emptyProps(),
    'Dismiss Outbox Item': props<{ id: string }>(),
    'Sync Success': props<{ id: string }>(),
    'Sync Failure': props<{ id: string; error: string }>()
  }
})

import { createActionGroup, emptyProps, props } from '@ngrx/store'
import type {
  AnomalyChangeKind,
  AnomalyChangePayload,
  AuditEntry,
  ExpertOpinion,
  FieldConflict,
  FieldReview,
  DispositionPlan,
  Station,
  TailingsDataset,
  Threshold
} from '../domain'

export const TailingsActions = createActionGroup({
  source: 'Tailings',
  events: {
    'Load Dataset': emptyProps(),
    'Load Dataset Success': props<{ dataset: TailingsDataset }>(),
    'Load Dataset Failure': props<{ error: string }>(),

    // 值班台直接改动（在线，立即进入正本）
    'Submit Field Review': props<{ anomalyId: string; review: FieldReview }>(),
    'Add Expert Opinion': props<{ anomalyId: string; opinion: ExpertOpinion }>(),
    'Save Disposition Plan': props<{ anomalyId: string; plan: DispositionPlan }>(),
    'Approve Plan': props<{ anomalyId: string; approver: string; note: string }>(),
    'Close Anomaly': props<{ anomalyId: string; note: string }>(),
    'Create Emergency Link': props<{ anomalyId: string; note: string }>(),
    'Reconfirm Anomaly': props<{ anomalyId: string; note: string }>(),

    // 离线终端：改动进入本地待办（Outbox），恢复网络后重试合并
    'Queue Offline Change': props<{ anomalyId: string; kind: AnomalyChangeKind; payload: AnomalyChangePayload }>(),
    'Retry Outbox Item': props<{ itemId: string }>(),
    'Sync Outbox': emptyProps(),
    'Go Online': emptyProps(),
    'Go Offline': emptyProps(),
    'Set Station': props<{ stationId: string }>(),
    'Resolve Conflict': props<{ anomalyId: string; conflictId: string; side: 'console' | 'incoming' }>(),
    'Dismiss Merge Report': props<{ reportId: string }>(),

    // 阈值版本发布：未结案异常按新版重算并重新确认，已结案冻结
    'Publish Threshold': props<{ threshold: Threshold }>(),

    // 演示并发：模拟另一值班台在终端离线期间改动正本
    'Simulate Console Edit': props<{ anomalyId: string; kind: AnomalyChangeKind; payload: AnomalyChangePayload; label: string }>(),

    'Select Anomaly': props<{ anomalyId: string }>(),
    'Update Keyword': props<{ keyword: string }>(),
    'Update Status': props<{ status: string }>(),
    'Add Audit': props<{ entry: AuditEntry }>(),
    'Reset Demo': emptyProps()
  }
})

export type { Station }

import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTableModule } from '@angular/material/table'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Store } from '@ngrx/store'
import type { Anomaly, DispositionPlan, ExpertOpinion, FieldConflict, FieldReview, PendingChange } from '../domain'
import { OutboxPanelComponent } from '../components/outbox-panel.component'
import { anomalyBasis } from '../services/sync-engine'
import { TailingsActions } from '../store/tailings.actions'
import { selectAnomalies, selectDataset, selectFilteredAnomalies, selectOnline, selectOutbox, selectSelectedAnomaly, selectSelectedBasis } from '../store/tailings.selectors'

@Component({
  selector: 'app-anomaly-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatTableModule, MatTooltipModule, OutboxPanelComponent],
  template: `
    <section class="page">
      <app-outbox-panel />
      <div class="metrics">
        <article><span>待现场复核</span><strong>{{ count('待现场复核') }}</strong><small>不得直接关闭</small></article>
        <article><span>调查与审批</span><strong>{{ count('原因调查中') + count('待负责人审批') }}</strong><small>多专业意见并存</small></article>
        <article><span>应急联动</span><strong>{{ count('应急联动') }}</strong><small>重大异常强制联动</small></article>
        <article><span>已关闭</span><strong>{{ count('已关闭') }}</strong><small>证据按原阈值版本锁定</small></article>
      </div>
      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索异常</mat-label><input matInput [(ngModel)]="localKeyword" (ngModelChange)="updateKeyword($event)" /></mat-form-field><mat-form-field appearance="outline"><mat-label>状态</mat-label><mat-select [(ngModel)]="localStatus" (ngModelChange)="updateStatus($event)"><mat-option value="全部">全部</mat-option><mat-option *ngFor="let item of statuses" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field></div>
      <div class="split">
        <table mat-table [dataSource]="filtered$ | async" class="panel">
          <ng-container matColumnDef="title"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let row"><b>{{ row.title }}</b><small class="sub">{{ row.id }} · {{ row.pointId }}</small><small class="pending" *ngIf="pendingText(row.id)"><mat-icon>cloud_off</mat-icon>{{ pendingText(row.id) }}</small><small class="pending conflict" *ngIf="row.merge?.state === '待交接'"><mat-icon>call_merge</mat-icon>字段冲突待交接</small></td></ng-container>
          <ng-container matColumnDef="severity"><th mat-header-cell *matHeaderCellDef>级别</th><td mat-cell *matCellDef="let row"><span class="severity" [class.major]="row.severity === '重大'">{{ row.severity }}</span><em class="reconfirm-dot" *ngIf="row.needsReconfirm" matTooltip="阈值新版已重算，待重新确认">重算待确认</em></td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row">{{ row.status }}</td></ng-container>
          <ng-container matColumnDef="basis"><th mat-header-cell *matHeaderCellDef>版本依据</th><td mat-cell *matCellDef="let row"><span class="basis"><mat-icon>{{ row.status === '已关闭' ? 'lock' : 'rule_folder' }}</mat-icon>阈值V{{ row.thresholdVersion }}</span><small class="sub" *ngIf="row.status === '已关闭'">结案锁定原版</small></td></ng-container>
          <ng-container matColumnDef="version"><th mat-header-cell *matHeaderCellDef>版本</th><td mat-cell *matCellDef="let row">V{{ row.version }}</td></ng-container>
          <ng-container matColumnDef="open"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let row"><button mat-button (click)="select(row.id)">审阅</button></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns" [class.selected]="row.id === (selected$ | async)?.id"></tr>
        </table>
        <div class="panel detail" *ngIf="selected$ | async as selected">
          <div class="detail-head"><div><span>{{ selected.id }} · 终端V{{ selected.version }}</span><h2>{{ selected.title }}</h2><p>{{ selected.observedValue }}</p></div><span class="severity" [class.major]="selected.severity === '重大'">{{ selected.severity }}</span></div>

          <div class="basis-line">
            <mat-icon>{{ selected.status === '已关闭' ? 'lock' : 'fact' }}</mat-icon>
            <div>
              <b>版本依据（与列表、导出审阅包一致）</b>
              <span>{{ basisText(selected) }}</span>
            </div>
          </div>

          <div class="reconfirm-band" *ngIf="selected.needsReconfirm">
            <div><b>阈值已发布新版，待审批异常已按新版重算并需重新确认</b><p>{{ selected.recalcNote }}</p><small>由阈值V{{ selected.recalculatedFrom }}重算至V{{ selected.thresholdVersion }} · {{ selected.recalculatedAt.replace('T', ' ').slice(0, 16) }}</small></div>
            <button mat-flat-button color="primary" (click)="reconfirm(selected)">值班重新确认</button>
          </div>

          <div class="closed-basis" *ngIf="selected.status === '已关闭'">
            <mat-icon>inventory_2</mat-icon>
            <p>异常已结案，现场证据、处置签批与阈值依据V{{ selected.thresholdVersion }}一并锁定；阈值再发布新版也不重算，继续按原版查看。</p>
          </div>

          <ng-container *ngIf="selected.merge as merge">
            <h3>值班台合并交接</h3>
            <div class="merge-state" [class.done]="merge.state === '已交接'">
              <b><mat-icon>{{ merge.state === '待交接' ? 'call_merge' : 'task_alt' }}</mat-icon>{{ merge.state === '待交接' ? '存在字段冲突，两边版本均保留，逐字段交接' : '冲突已全部交接完成' }}</b>
              <span>终端V{{ merge.localVersion }} × 值班台V{{ merge.stationVersion }} · {{ merge.stationOperator }} · {{ merge.mergedAt.replace('T', ' ').slice(0, 16) }}</span>
              <p>{{ merge.note }}</p>
            </div>

            <div class="conflict-row" *ngFor="let conflict of merge.conflicts">
              <div class="conflict-head"><b>{{ conflict.label }}</b><em *ngIf="conflict.protected" class="protected"><mat-icon>gpp_good</mat-icon>值班台方案已签批，晚到记录不得覆盖</em></div>
              <div class="conflict-choices">
                <label [class.chosen]="conflict.resolution === 'local'">
                  <input type="radio" [name]="conflict.key" value="local" [disabled]="conflict.protected" [checked]="conflict.resolution === 'local'" (change)="resolve(selected, conflict, 'local')" />
                  <span class="who">终端 V{{ merge.localVersion }}</span><span class="val">{{ conflict.localValue }}</span>
                </label>
                <label [class.chosen]="conflict.resolution === 'station'">
                  <input type="radio" [name]="conflict.key" value="station" [disabled]="conflict.protected" [checked]="conflict.resolution === 'station'" (change)="resolve(selected, conflict, 'station')" />
                  <span class="who">值班台 V{{ merge.stationVersion }}</span><span class="val">{{ conflict.stationValue }}</span>
                </label>
              </div>
              <small class="base">共同基线原值：{{ conflict.baseValue }}</small>
            </div>

            <details class="snapshots" [open]="merge.state === '待交接'">
              <summary>两边保留版本快照（交接可追溯）</summary>
              <div class="snap-grid">
                <article><h4>终端版本 V{{ merge.localSnapshot?.version }}</h4><p>状态：{{ merge.localSnapshot?.status }}</p><p>责任方：{{ merge.localSnapshot?.owner }}</p><p>方案：{{ merge.localSnapshot?.plan.action }}（{{ merge.localSnapshot?.plan.owner }}）</p><p>签批：{{ merge.localSnapshot?.plan.approvedBy || '未签批' }}</p><p>复核 {{ merge.localSnapshot?.fieldReviews.length }} 条 / 意见 {{ merge.localSnapshot?.opinions.length }} 条</p></article>
                <article><h4>值班台版本 V{{ merge.stationSnapshot?.version }}</h4><p>状态：{{ merge.stationSnapshot?.status }}</p><p>责任方：{{ merge.stationSnapshot?.owner }}</p><p>方案：{{ merge.stationSnapshot?.plan.action }}（{{ merge.stationSnapshot?.plan.owner }}）</p><p>签批：{{ merge.stationSnapshot?.plan.approvedBy || '未签批' }}</p><p>复核 {{ merge.stationSnapshot?.fieldReviews.length }} 条 / 意见 {{ merge.stationSnapshot?.opinions.length }} 条</p></article>
              </div>
            </details>
          </ng-container>

          <h3>现场复核</h3>
          <div class="review-form"><mat-form-field appearance="outline" class="wide"><mat-label>现场观察</mat-label><textarea matInput rows="2" [(ngModel)]="fieldForm.observed"></textarea></mat-form-field><mat-form-field appearance="outline"><mat-label>证据清单</mat-label><input matInput [(ngModel)]="fieldForm.evidence" /></mat-form-field><mat-form-field appearance="outline"><mat-label>重新评估</mat-label><input matInput [(ngModel)]="fieldForm.reassessment" /></mat-form-field><button mat-flat-button color="primary" (click)="submitReview(selected)">{{ (online$ | async) ? '提交复核版本' : '离线留存复核' }}</button></div>
          <div class="records" *ngFor="let review of selected.fieldReviews"><b>{{ review.inspector }} · V{{ review.version }}</b><p>{{ review.observed }}</p><span>{{ review.reassessment }} · {{ review.evidence }}</span></div>
          <h3>专业意见</h3>
          <div class="opinion-form"><mat-form-field appearance="outline"><mat-label>专业</mat-label><mat-select [(ngModel)]="opinionForm.discipline"><mat-option *ngFor="let item of disciplines" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline" class="wide"><mat-label>意见</mat-label><input matInput [(ngModel)]="opinionForm.content" /></mat-form-field><button mat-button (click)="addOpinion(selected)">补充意见</button></div>
          <div class="opinions"><article *ngFor="let opinion of selected.opinions"><b>{{ opinion.discipline }}专家 {{ opinion.specialist }}</b><span>{{ opinion.conclusion }}</span><p>{{ opinion.content }}</p></article></div>
          <h3>处置方案与会签</h3>
          <div class="plan-form"><mat-form-field appearance="outline"><mat-label>措施</mat-label><mat-select [(ngModel)]="planForm.action"><mat-option *ngFor="let item of actions" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>责任方</mat-label><input matInput [(ngModel)]="planForm.owner" /></mat-form-field><mat-form-field appearance="outline" class="wide"><mat-label>关闭条件</mat-label><textarea matInput rows="2" [(ngModel)]="planForm.conditions"></textarea></mat-form-field><mat-form-field appearance="outline"><mat-label>截止</mat-label><input matInput type="datetime-local" [(ngModel)]="planForm.deadline" /></mat-form-field><button mat-button (click)="savePlan(selected)">提交审批</button></div>
          <div class="approval-band"><div><b>{{ selected.plan.approvedBy || '尚未审批' }}</b><span>{{ selected.plan.conditions }}</span></div><button mat-flat-button color="primary" [disabled]="selected.severity === '重大' && !selected.plan.emergencyLinked" (click)="approve(selected)">负责人审批</button><button mat-button color="warn" (click)="emergency(selected)">应急联动</button><button mat-button [disabled]="selected.status !== '待负责人审批'" (click)="close(selected)">关闭异常</button></div>

          <details class="merge-sim">
            <summary>模拟另一值班台同时修改并合并（回到内网交接）</summary>
            <div class="sim-form">
              <mat-form-field appearance="outline"><mat-label>值班台操作人</mat-label><input matInput [(ngModel)]="stationForm.operator" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>状态</mat-label><mat-select [(ngModel)]="stationForm.status"><mat-option *ngFor="let item of statuses" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>级别</mat-label><mat-select [(ngModel)]="stationForm.severity"><mat-option value="关注">关注</mat-option><mat-option value="较高">较高</mat-option><mat-option value="重大">重大</mat-option></mat-select></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>责任方</mat-label><input matInput [(ngModel)]="stationForm.owner" /></mat-form-field>
              <mat-form-field appearance="outline" class="wide"><mat-label>观测值描述</mat-label><input matInput [(ngModel)]="stationForm.observedValue" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>处置措施</mat-label><mat-select [(ngModel)]="stationForm.action"><mat-option *ngFor="let item of actions" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>方案责任方</mat-label><input matInput [(ngModel)]="stationForm.planOwner" /></mat-form-field>
              <mat-form-field appearance="outline" class="wide"><mat-label>值班台现场复核（可选，将与终端版本并存）</mat-label><input matInput [(ngModel)]="stationForm.review" placeholder="值班台复核结论" /></mat-form-field>
              <label class="check"><mat-checkbox [(ngModel)]="stationForm.approved">值班台已签批该方案（晚到记录不得覆盖）</mat-checkbox></label>
              <label class="check"><mat-checkbox [(ngModel)]="stationForm.changeSame">仅勾选：值班台改动与终端相同字段，制造字段冲突</mat-checkbox></label>
              <button mat-flat-button color="primary" (click)="runMerge(selected)">与值班台合并</button>
            </div>
          </details>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.metrics { display: grid; grid-template-columns: repeat(4, 1fr); background: white; border: 1px solid #d9e1df; margin-bottom: 14px; }.metrics article { padding: 16px 18px; border-right: 1px solid #e2e7e6; }.metrics article:last-child { border: 0; }.metrics span, .metrics strong, .metrics small { display: block; }.metrics span { color: #72807d; font-size: 12px; }.metrics strong { font-size: 26px; color: #245060; margin: 6px 0; }.metrics small { color: #98a4a0; font-size: 10px; }
    .toolbar { display: flex; gap: 10px; margin-bottom: 10px; }.split { display: grid; grid-template-columns: minmax(620px,1fr) 560px; gap: 14px; align-items: start; }.panel { background: white; border: 1px solid #d9e1df; } table { width: 100%; }.selected { background: #eef5f4; }.sub { display: block; color: #7c8986; font-size: 10px; margin-top: 3px; }.severity { padding: 3px 7px; border-radius: 3px; background: #f7edd6; color: #8e681d; font-size: 11px; }.severity.major { background: #fae7e5; color: #a23b34; }
    .pending { display: inline-flex; align-items: center; gap: 3px; color: #9a7a2e; font-size: 10px; margin-top: 3px; } .pending mat-icon { font-size: 12px; width: 12px; height: 12px; } .pending.conflict { color: #a55a1f; }
    .reconfirm-dot { display: inline-block; margin-left: 6px; padding: 2px 6px; background: #fdeede; color: #b4611d; border-radius: 8px; font-size: 10px; font-style: normal; }
    .basis { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #315d6e; } .basis mat-icon { font-size: 14px; width: 14px; height: 14px; color: #7d96a0; }
    .detail { padding: 16px; max-height: none; }.detail-head { display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid #e1e6e5; padding-bottom: 12px; }.detail-head span { color: #74827f; font-size: 10px; }.detail-head h2 { margin: 4px 0; font-size: 18px; }.detail-head p { margin: 0; color: #65736f; font-size: 12px; }.detail h3 { font-size: 13px; margin: 16px 0 8px; }
    .basis-line { display: flex; gap: 9px; align-items: center; background: #eef5f4; border-left: 3px solid #315d6e; padding: 9px 11px; margin-top: 12px; } .basis-line mat-icon { color: #315d6e; font-size: 18px; width: 18px; height: 18px; } .basis-line b, .basis-line span { display: block; } .basis-line b { font-size: 11px; color: #245060; } .basis-line span { font-size: 11px; color: #5f726d; margin-top: 2px; }
    .reconfirm-band { display: flex; justify-content: space-between; align-items: center; gap: 12px; background: #fdf3e7; border: 1px solid #e4b483; padding: 10px 12px; margin-top: 10px; } .reconfirm-band b { font-size: 12px; color: #97531b; display: block; } .reconfirm-band p { font-size: 11px; color: #7c5a3c; margin: 4px 0; } .reconfirm-band small { color: #a7855f; font-size: 10px; }
    .closed-basis { display: flex; gap: 9px; align-items: flex-start; background: #f2f4f3; border-left: 3px solid #8a9690; padding: 9px 11px; margin-top: 10px; } .closed-basis mat-icon { color: #7b8883; } .closed-basis p { margin: 0; font-size: 11px; color: #5f6d68; }
    .merge-state { background: #fbf4e6; border-left: 3px solid #c99f3d; padding: 9px 11px; } .merge-state.done { background: #eef7f1; border-left-color: #3d8f68; } .merge-state b { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #8e681d; } .merge-state.done b { color: #2e765a; } .merge-state b mat-icon { font-size: 16px; width: 16px; height: 16px; } .merge-state span { display: block; color: #8a9793; font-size: 10px; margin: 3px 0; } .merge-state p { margin: 0; font-size: 11px; color: #6d6048; }
    .conflict-row { border: 1px solid #e6d6b4; padding: 9px 11px; margin-top: 8px; background: #fffdf7; } .conflict-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; } .conflict-head b { font-size: 12px; color: #4b5753; } .protected { display: inline-flex; align-items: center; gap: 3px; color: #2e765a; font-size: 10px; font-style: normal; background: #e7f3ee; padding: 2px 7px; border-radius: 9px; } .protected mat-icon { font-size: 13px; width: 13px; height: 13px; }
    .conflict-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .conflict-choices label { display: grid; grid-template-columns: auto 1fr; gap: 3px 8px; border: 1px solid #e2e7e6; padding: 7px 9px; cursor: pointer; } .conflict-choices label.chosen { border-color: #315d6e; background: #f0f6f8; } .conflict-choices input { margin-top: 2px; } .conflict-choices .who { font-size: 10px; color: #83918d; font-weight: 600; } .conflict-choices .val { grid-column: 2; font-size: 11px; color: #46534f; } .base { display: block; color: #9aa5a1; font-size: 10px; margin-top: 5px; }
    .snapshots { margin-top: 10px; } .snapshots summary { cursor: pointer; font-size: 11px; color: #315d6e; } .snap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; } .snap-grid article { border: 1px solid #e2e7e6; padding: 8px 10px; background: #fafbfb; } .snap-grid h4 { margin: 0 0 5px; font-size: 11px; color: #315d6e; } .snap-grid p { margin: 2px 0; font-size: 10px; color: #65736f; }
    .review-form, .opinion-form, .plan-form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.review-form .wide, .opinion-form .wide, .plan-form .wide { grid-column: 1 / -1; }.review-form button, .plan-form button { align-self: center; }.records { border-left: 3px solid #315d6e; background: #f5f8f7; padding: 9px; margin-top: 7px; display: grid; gap: 4px; }.records p { margin: 0; font-size: 12px; }.records span { color: #72807d; font-size: 10px; }
    .opinions article { border-bottom: 1px solid #e2e7e6; padding: 9px 0; display: grid; grid-template-columns: 1fr auto; gap: 4px; }.opinions p { grid-column: 1 / -1; margin: 0; font-size: 12px; }.opinions span { color: #8a6720; font-size: 10px; }
    .approval-band { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 7px; background: #f6f0df; border-left: 3px solid #c99f3d; padding: 10px; margin-top: 12px; }.approval-band b, .approval-band span { display: block; }.approval-band span { color: #746c55; font-size: 10px; margin-top: 4px; }
    .merge-sim { margin-top: 16px; border-top: 1px dashed #d8e0dd; padding-top: 10px; } .merge-sim summary { cursor: pointer; font-size: 12px; color: #72807d; } .sim-form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; } .sim-form .wide { grid-column: 1 / -1; } .sim-form .check { grid-column: 1 / -1; font-size: 11px; color: #65736f; display: flex; align-items: center; }
  `]
})
export class AnomalyPageComponent {
  private readonly store = inject(Store)
  readonly filtered$ = this.store.select(selectFilteredAnomalies)
  readonly selected$ = this.store.select(selectSelectedAnomaly)
  readonly all$ = this.store.select(selectAnomalies)
  readonly dataset$ = this.store.select(selectDataset)
  readonly online$ = this.store.select(selectOnline)
  readonly outbox$ = this.store.select(selectOutbox)
  readonly basis$ = this.store.select(selectSelectedBasis)
  readonly columns = ['title', 'severity', 'status', 'basis', 'version', 'open']
  readonly statuses: Anomaly['status'][] = ['待现场复核', '原因调查中', '待负责人审批', '应急联动', '已关闭']
  readonly disciplines: ExpertOpinion['discipline'][] = ['坝体', '水文', '岩土', '应急']
  readonly actions: DispositionPlan['action'][] = ['加密监测', '降低库水位', '疏通排水', '应急撤离准备', '工程加固']
  localKeyword = ''
  localStatus: Anomaly['status'] | '全部' = '全部'
  fieldForm = { observed: '', evidence: '', reassessment: '' }
  opinionForm = { discipline: '坝体' as ExpertOpinion['discipline'], content: '' }
  planForm = { action: '加密监测' as DispositionPlan['action'], owner: '坝体安全组', conditions: '', deadline: '2026-10-05T18:00' }
  stationForm = { operator: '值班台 何清', status: '应急联动' as Anomaly['status'], severity: '重大' as Anomaly['severity'], owner: '库区调度班', observedValue: '18.7 mm，值班台复测速率4.8 mm/d', action: '降低库水位' as DispositionPlan['action'], planOwner: '应急抢险队', review: '值班台复测：位移仍在发展，建议撤离准备。', approved: true, changeSame: true }

  private dataset(): import('../domain').TailingsDataset { let value!: import('../domain').TailingsDataset; this.dataset$.subscribe((dataset) => { value = dataset }).unsubscribe(); return value }
  private outboxItems(): PendingChange[] { let value: PendingChange[] = []; this.outbox$.subscribe((items) => { value = items }).unsubscribe(); return value }

  count(status: Anomaly['status']): number { let value = 0; this.all$.subscribe((items) => { value = items.filter((item) => item.status === status).length }).unsubscribe(); return value }
  updateKeyword(value: string): void { this.store.dispatch(TailingsActions.updateKeyword({ keyword: value })) }
  updateStatus(value: Anomaly['status'] | '全部'): void { this.store.dispatch(TailingsActions.updateStatus({ status: value })) }
  select(id: string): void { this.store.dispatch(TailingsActions.selectAnomaly({ anomalyId: id })) }

  pendingText(anomalyId: string): string {
    const items = this.outboxItems().filter((item) => item.anomalyId === anomalyId)
    return items.length ? `终端待办 ${items.length} 条` : ''
  }

  basisText(anomaly: Anomaly): string {
    const dataset = this.dataset()
    const point = dataset?.points.find((item) => item.id === anomaly.pointId)
    if (!dataset) return `阈值V${anomaly.thresholdVersion}`
    const basis = anomalyBasis(dataset, anomaly)
    const time = basis.issuedAt ? `（发布于${basis.issuedAt.replace('T', ' ').slice(0, 5)}）` : ''
    const id = point?.thresholdId ?? basis.thresholdId
    if (anomaly.status === '已关闭') {
      return `${id} 阈值V${basis.thresholdVersion} 已随结案锁定，证据按原版查看${basis.newerAvailable ? `；当前已发布V${basis.currentVersion}，本异常不重算` : ''}${time}`
    }
    return `${id} 阈值V${basis.thresholdVersion}${basis.newerAvailable ? `（当前新版V${basis.currentVersion}）` : ''}${time}`
  }

  submitReview(anomaly: Anomaly): void {
    const review: FieldReview = { id: `FR-${Date.now()}`, inspector: '宋立', arrivedAt: new Date().toISOString(), ...this.fieldForm, version: 0 }
    this.store.dispatch(TailingsActions.submitFieldReview({ anomalyId: anomaly.id, review }))
  }
  addOpinion(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.addExpertOpinion({ anomalyId: anomaly.id, opinion: { id: `OP-${Date.now()}`, specialist: '当前用户', ...this.opinionForm, conclusion: '补充证据', createdAt: new Date().toISOString() } })) }
  savePlan(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.saveDispositionPlan({ anomalyId: anomaly.id, plan: { id: anomaly.plan.id, ...this.planForm, emergencyLinked: anomaly.plan.emergencyLinked, approvedBy: anomaly.plan.approvedBy, approvedAt: anomaly.plan.approvedAt } })) }
  approve(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.approvePlan({ anomalyId: anomaly.id, approver: '负责人 何清', note: '同意执行，严格执行关闭条件。' })) }
  emergency(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.createEmergencyLink({ anomalyId: anomaly.id, note: '重大异常联动应急值班，通知下游巡查。' })) }
  close(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.closeAnomaly({ anomalyId: anomaly.id, note: '复测数据稳定，关闭条件已满足。' })) }
  reconfirm(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.reconfirmRecalc({ anomalyId: anomaly.id, operator: '值班负责人', note: '已按新版阈值复核处置条件，确认继续执行。' })) }

  resolve(anomaly: Anomaly, conflict: FieldConflict, resolution: 'local' | 'station'): void {
    this.store.dispatch(TailingsActions.resolveConflict({ anomalyId: anomaly.id, conflictKey: conflict.key, resolution }))
  }

  runMerge(anomaly: Anomaly): void {
    const station: Anomaly = structuredClone(anomaly)
    delete station.syncBase
    station.status = this.stationForm.status
    station.severity = this.stationForm.severity
    if (this.stationForm.changeSame) {
      station.owner = this.stationForm.owner
      station.observedValue = this.stationForm.observedValue
    }
    station.plan = {
      ...station.plan,
      action: this.stationForm.action,
      owner: this.stationForm.changeSame ? this.stationForm.planOwner : station.plan.owner,
      approvedBy: this.stationForm.approved ? '值班负责人 何清' : '',
      approvedAt: this.stationForm.approved ? new Date().toISOString() : ''
    }
    if (this.stationForm.review) {
      station.fieldReviews = [{ id: `FR-STA-${Date.now()}`, inspector: this.stationForm.operator, arrivedAt: new Date().toISOString(), observed: this.stationForm.review, evidence: '值班台复测记录', reassessment: this.stationForm.review, version: station.fieldReviews.length + 1 }, ...station.fieldReviews]
    }
    station.version += 1
    this.store.dispatch(TailingsActions.mergeStationChanges({ anomalyId: anomaly.id, station, stationOperator: this.stationForm.operator }))
  }
}

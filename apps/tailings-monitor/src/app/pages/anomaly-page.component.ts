import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import type { Anomaly, AnomalyChangeKind, AnomalyChangePayload, DispositionPlan, ExpertOpinion, FieldReview } from '../domain'
import { FIELD_LABELS } from '../domain'
import { TailingsActions } from '../store/tailings.actions'
import { selectActiveStation, selectAnomalyBases, selectAnomalies, selectBasisMap, selectFilteredAnomalies, selectNetworkOnline, selectSelectedAnomaly } from '../store/tailings.selectors'

@Component({
  selector: 'app-anomaly-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule],
  template: `
    <section class="page">
      <div class="metrics">
        <article><span>待现场复核</span><strong>{{ count('待现场复核') }}</strong><small>不得直接关闭</small></article>
        <article><span>调查与审批</span><strong>{{ count('原因调查中') + count('待负责人审批') }}</strong><small>多专业意见并存</small></article>
        <article><span>应急联动</span><strong>{{ count('应急联动') }}</strong><small>重大异常强制联动</small></article>
        <article><span>已关闭</span><strong>{{ count('已关闭') }}</strong><small>证据按原阈值版本查看</small></article>
      </div>
      <div class="toolbar">
        <mat-form-field appearance="outline"><mat-label>搜索异常</mat-label><input matInput [(ngModel)]="localKeyword" (ngModelChange)="updateKeyword($event)" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>状态</mat-label><mat-select [(ngModel)]="localStatus" (ngModelChange)="updateStatus($event)"><mat-option value="全部">全部</mat-option><mat-option *ngFor="let item of statuses" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field>
        <div class="station-chip" [class.offline]="!online"><span class="dot"></span>{{ (station$ | async)?.name }} · {{ online ? '内网在线' : '离线暂存' }}</div>
      </div>
      <div class="split">
        <table mat-table [dataSource]="filtered$ | async" class="panel">
          <ng-container matColumnDef="title"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let row"><b>{{ row.title }}</b><small class="sub">{{ row.id }} · {{ row.pointId }}</small></td></ng-container>
          <ng-container matColumnDef="severity"><th mat-header-cell *matHeaderCellDef>级别</th><td mat-cell *matCellDef="let row"><span class="severity" [class.major]="row.severity === '重大'">{{ row.severity }}</span></td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row">{{ row.status }}<small class="sub" *ngIf="row.reconfirmRequired">阈值升版待重新确认</small></td></ng-container>
          <ng-container matColumnDef="version"><th mat-header-cell *matHeaderCellDef>版本依据</th><td mat-cell *matCellDef="let row"><ng-container *ngIf="basisMap$ | async as basisMap"><b>V{{ row.version }}</b><small class="sub" [class.frozen]="basisMap.get(row.id)?.basis.frozen">{{ basisMap.get(row.id)?.basis.thresholdId }} V{{ basisMap.get(row.id)?.basis.version }}<ng-container *ngIf="basisMap.get(row.id)?.basis.frozen"> · 结案冻结</ng-container></small><span class="conflict-flag" *ngIf="basisMap.get(row.id)?.pendingConflicts">{{ basisMap.get(row.id)?.pendingConflicts }}项字段待交接</span></ng-container></td></ng-container>
          <ng-container matColumnDef="open"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let row"><button mat-button (click)="select(row.id)">审阅</button></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns" [class.selected]="row.id === (selected$ | async)?.id"></tr>
        </table>
        <div class="panel detail" *ngIf="selected$ | async as selected">
          <ng-container *ngIf="basisMap$ | async as basisMap">
          <div class="detail-head">
            <div><span>{{ selected.id }} · 异常版本 V{{ selected.version }}</span><h2>{{ selected.title }}</h2><p>{{ selected.observedValue }}</p></div>
            <div class="head-right"><span class="severity" [class.major]="selected.severity === '重大'">{{ selected.severity }}</span></div>
          </div>
          <div class="basis-bar" [class.frozen]="basisMap.get(selected.id)?.basis.frozen" [class.reconfirm]="selected.reconfirmRequired">
            <div><b>版本依据</b><span>{{ basisMap.get(selected.id)?.basis.source }}：预警 {{ basisMap.get(selected.id)?.basis.warning }} / 报警 {{ basisMap.get(selected.id)?.basis.alarm }} / 速率 {{ basisMap.get(selected.id)?.basis.changeRate }} {{ basisMap.get(selected.id)?.basis.unit }}</span></div>
            <button mat-stroked-button color="primary" *ngIf="selected.reconfirmRequired" (click)="reconfirm(selected)">按新版重新确认</button>
          </div>
          <p class="recalc" *ngIf="selected.recalcNote">{{ selected.recalcNote }}</p>

          <div class="conflict-box" *ngIf="pendingConflicts(selected).length">
            <h3>字段冲突交接（两个版本均已保留）</h3>
            <article *ngFor="let conflict of pendingConflicts(selected)">
              <div><b>{{ fieldLabel(conflict.field) }}</b><span>来自 {{ conflict.incomingStation }} 的晚到版本</span></div>
              <div class="sides"><span class="console"><small>值班台正本</small>{{ conflict.consoleDigest }}</span><span class="incoming"><small>晚到版本</small>{{ conflict.incomingDigest }}</span></div>
              <div class="resolve"><button mat-button color="primary" (click)="resolve(selected.id, conflict.id, 'console')">采用值班台</button><button mat-button (click)="resolve(selected.id, conflict.id, 'incoming')">采用晚到版本</button></div>
            </article>
          </div>

          <div class="branch-box" *ngIf="selected.branches.length">
            <h3>异机保留版本</h3>
            <article *ngFor="let branch of selected.branches"><b>{{ branch.stationName }} · {{ branch.operator }}</b><span>{{ branch.reason }} · 依据 V{{ branch.sourceVersion }} · {{ branch.kind }}</span></article>
          </div>

          <h3>现场复核</h3>
          <div class="review-form"><mat-form-field appearance="outline" class="wide"><mat-label>现场观察</mat-label><textarea matInput rows="2" [(ngModel)]="fieldForm.observed"></textarea></mat-form-field><mat-form-field appearance="outline"><mat-label>证据清单</mat-label><input matInput [(ngModel)]="fieldForm.evidence" /></mat-form-field><mat-form-field appearance="outline"><mat-label>重新评估</mat-label><input matInput [(ngModel)]="fieldForm.reassessment" /></mat-form-field><button mat-flat-button color="primary" (click)="submitReview(selected)">{{ online ? '提交复核版本' : '离线暂存复核' }}</button></div>
          <div class="records" *ngFor="let review of selected.fieldReviews"><b>{{ review.inspector }} · V{{ review.version }}</b><p>{{ review.observed }}</p><span>{{ review.reassessment }} · {{ review.evidence }}</span></div>
          <h3>专业意见</h3>
          <div class="opinion-form"><mat-form-field appearance="outline"><mat-label>专业</mat-label><mat-select [(ngModel)]="opinionForm.discipline"><mat-option *ngFor="let item of disciplines" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline" class="wide"><mat-label>意见</mat-label><input matInput [(ngModel)]="opinionForm.content" /></mat-form-field><button mat-button (click)="addOpinion(selected)">{{ online ? '补充意见' : '离线暂存意见' }}</button></div>
          <div class="opinions"><article *ngFor="let opinion of selected.opinions"><b>{{ opinion.discipline }}专家 {{ opinion.specialist }}</b><span>{{ opinion.conclusion }}</span><p>{{ opinion.content }}</p></article></div>
          <h3>处置方案与会签</h3>
          <div class="plan-form"><mat-form-field appearance="outline"><mat-label>措施</mat-label><mat-select [(ngModel)]="planForm.action"><mat-option *ngFor="let item of actions" [value]="item">{{ item }}</mat-option></mat-select></mat-form-field><mat-form-field appearance="outline"><mat-label>责任方</mat-label><input matInput [(ngModel)]="planForm.owner" /></mat-form-field><mat-form-field appearance="outline" class="wide"><mat-label>关闭条件</mat-label><textarea matInput rows="2" [(ngModel)]="planForm.conditions"></textarea></mat-form-field><mat-form-field appearance="outline"><mat-label>截止</mat-label><input matInput type="datetime-local" [(ngModel)]="planForm.deadline" /></mat-form-field><button mat-button (click)="savePlan(selected)">{{ online ? '提交审批' : '离线暂存方案' }}</button></div>
          <p class="guard-hint" *ngIf="selected.plan.approvedBy">方案已由 {{ selected.plan.approvedBy }} 签批；其它值班台/终端晚到的改方案记录将被保留但不覆盖签批结论。</p>
          <div class="approval-band"><div><b>{{ selected.plan.approvedBy || '尚未审批' }}</b><span>{{ selected.plan.conditions }}</span></div><button mat-flat-button color="primary" [disabled]="(selected.severity === '重大' && !selected.plan.emergencyLinked) || selected.reconfirmRequired" (click)="approve(selected)">{{ selected.reconfirmRequired ? '先按新版确认' : '负责人审批' }}</button><button mat-button color="warn" (click)="emergency(selected)">应急联动</button><button mat-button [disabled]="selected.status !== '待负责人审批' || selected.reconfirmRequired" (click)="close(selected)">关闭异常</button></div>
          </ng-container>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.metrics { display: grid; grid-template-columns: repeat(4, 1fr); background: white; border: 1px solid #d9e1df; margin-bottom: 14px; }.metrics article { padding: 16px 18px; border-right: 1px solid #e2e7e6; }.metrics article:last-child { border: 0; }.metrics span, .metrics strong, .metrics small { display: block; }.metrics span { color: #72807d; font-size: 12px; }.metrics strong { font-size: 26px; color: #245060; margin: 6px 0; }.metrics small { color: #98a4a0; font-size: 10px; }
    .toolbar { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; }.station-chip { margin-left: auto; display: flex; align-items: center; gap: 7px; font-size: 12px; color: #2e5b4f; background: #e7f3ee; border: 1px solid #bcd9ce; padding: 8px 12px; }.station-chip .dot { width: 8px; height: 8px; border-radius: 50%; background: #2e8b63; }.station-chip.offline { color: #8a5a18; background: #f8efd9; border-color: #e0c489; }.station-chip.offline .dot { background: #c28d27; }
    .split { display: grid; grid-template-columns: minmax(620px,1fr) 540px; gap: 14px; align-items: start; }.panel { background: white; border: 1px solid #d9e1df; } table { width: 100%; }.selected { background: #eef5f4; }.sub { display: block; color: #7c8986; font-size: 10px; margin-top: 3px; }.sub.frozen { color: #6b5a2e; }.conflict-flag { display: inline-block; margin-top: 3px; background: #fae7e5; color: #a23b34; font-size: 10px; padding: 2px 6px; }.severity { padding: 3px 7px; border-radius: 3px; background: #f7edd6; color: #8e681d; font-size: 11px; }.severity.major { background: #fae7e5; color: #a23b34; }
    .detail { padding: 16px; }.detail-head { display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid #e1e6e5; padding-bottom: 12px; }.detail-head span { color: #74827f; font-size: 10px; }.detail-head h2 { margin: 4px 0; font-size: 18px; }.detail-head p { margin: 0; color: #65736f; font-size: 12px; }.detail h3 { font-size: 13px; margin: 16px 0 8px; }
    .basis-bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; padding: 10px 12px; background: #eef5f4; border-left: 3px solid #315d6e; }.basis-bar.reconfirm { background: #f8efd9; border-left-color: #c28d27; }.basis-bar.frozen { background: #f4f1e7; border-left-color: #8a7a45; }.basis-bar b, .basis-bar span { display: block; }.basis-bar span { font-size: 11px; color: #53625f; margin-top: 3px; }.recalc { font-size: 11px; color: #8a6720; background: #faf3e0; padding: 7px 9px; margin: 8px 0 0; }
    .conflict-box { margin-top: 12px; border: 1px solid #e3b9b5; background: #fdf3f2; padding: 10px 12px; }.conflict-box h3 { margin: 0 0 8px; color: #a23b34; }.conflict-box article { border-top: 1px solid #eccdc9; padding: 8px 0; display: grid; gap: 6px; }.conflict-box article div:first-child { display: flex; justify-content: space-between; }.conflict-box small { display: block; color: #9a7a77; font-size: 10px; }.sides { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.sides .console, .sides .incoming { font-size: 12px; padding: 6px 8px; background: white; border: 1px solid #e2c9c7; }.resolve { display: flex; gap: 6px; justify-content: flex-end; }
    .branch-box { margin-top: 10px; border: 1px dashed #b8a76b; background: #faf6e8; padding: 8px 12px; }.branch-box h3 { margin: 0 0 6px; color: #7c6a2c; }.branch-box article { display: flex; justify-content: space-between; font-size: 11px; padding: 3px 0; }.branch-box span { color: #8a7c48; }
    .review-form, .opinion-form, .plan-form { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.review-form .wide, .opinion-form .wide, .plan-form .wide { grid-column: 1 / -1; }.review-form button, .plan-form button { align-self: center; }.records { border-left: 3px solid #315d6e; background: #f5f8f7; padding: 9px; margin-top: 7px; display: grid; gap: 4px; }.records p { margin: 0; font-size: 12px; }.records span { color: #72807d; font-size: 10px; }
    .opinions article { border-bottom: 1px solid #e2e7e6; padding: 9px 0; display: grid; grid-template-columns: 1fr auto; gap: 4px; }.opinions p { grid-column: 1 / -1; margin: 0; font-size: 12px; }.opinions span { color: #8a6720; font-size: 10px; }
    .guard-hint { font-size: 11px; color: #7c6a2c; background: #faf3e0; padding: 7px 9px; }.approval-band { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 7px; background: #f6f0df; border-left: 3px solid #c99f3d; padding: 10px; margin-top: 12px; }.approval-band b, .approval-band span { display: block; }.approval-band span { color: #746c55; font-size: 10px; margin-top: 4px; }
  `]
})
export class AnomalyPageComponent {
  private readonly store = inject(Store)
  readonly filtered$ = this.store.select(selectFilteredAnomalies)
  readonly selected$ = this.store.select(selectSelectedAnomaly)
  readonly all$ = this.store.select(selectAnomalies)
  readonly basisMap$ = this.store.select(selectBasisMap)
  readonly bases$ = this.store.select(selectAnomalyBases)
  readonly station$ = this.store.select(selectActiveStation)
  online = true
  readonly columns = ['title', 'severity', 'status', 'version', 'open']
  readonly statuses: Anomaly['status'][] = ['待现场复核', '原因调查中', '待负责人审批', '应急联动', '已关闭']
  readonly disciplines: ExpertOpinion['discipline'][] = ['坝体', '水文', '岩土', '应急']
  readonly actions: DispositionPlan['action'][] = ['加密监测', '降低库水位', '疏通排水', '应急撤离准备', '工程加固']
  localKeyword = ''
  localStatus: Anomaly['status'] | '全部' = '全部'
  fieldForm = { observed: '', evidence: '', reassessment: '' }
  opinionForm = { discipline: '坝体' as ExpertOpinion['discipline'], content: '' }
  planForm = { action: '加密监测' as DispositionPlan['action'], owner: '坝体安全组', conditions: '', deadline: '2026-10-06T18:00' }
  private readonly onlineSub = this.store.select(selectNetworkOnline).subscribe((online) => (this.online = online))

  count(status: Anomaly['status']): number { let value = 0; this.all$.subscribe((items) => { value = items.filter((item) => item.status === status).length }).unsubscribe(); return value }
  fieldLabel(field: keyof typeof FIELD_LABELS): string { return FIELD_LABELS[field] }
  pendingConflicts(anomaly: Anomaly) { return anomaly.conflicts.filter((conflict) => conflict.status === '待交接') }
  updateKeyword(value: string): void { this.store.dispatch(TailingsActions.updateKeyword({ keyword: value })) }
  updateStatus(value: Anomaly['status'] | '全部'): void { this.store.dispatch(TailingsActions.updateStatus({ status: value })) }
  select(id: string): void { this.store.dispatch(TailingsActions.selectAnomaly({ anomalyId: id })) }

  /** 值班台在线直接进入正本；巡检终端离线时改动进入本地待办，回内网后合并 */
  private dispatchChange(anomaly: Anomaly, kind: AnomalyChangeKind, payload: AnomalyChangePayload): void {
    if (this.online) {
      const actionMap = {
        fieldReview: () => this.store.dispatch(TailingsActions.submitFieldReview({ anomalyId: anomaly.id, review: payload.review! })),
        opinion: () => this.store.dispatch(TailingsActions.addExpertOpinion({ anomalyId: anomaly.id, opinion: payload.opinion! })),
        savePlan: () => this.store.dispatch(TailingsActions.saveDispositionPlan({ anomalyId: anomaly.id, plan: payload.plan! }))
      } as Partial<Record<AnomalyChangeKind, () => void>>
      actionMap[kind]?.()
    } else {
      this.store.dispatch(TailingsActions.queueOfflineChange({ anomalyId: anomaly.id, kind, payload }))
    }
  }

  submitReview(anomaly: Anomaly): void {
    const review: FieldReview = { id: `FR-${Date.now()}`, inspector: '宋立', arrivedAt: new Date().toISOString(), ...this.fieldForm, version: 0 }
    this.dispatchChange(anomaly, 'fieldReview', { review })
  }
  addOpinion(anomaly: Anomaly): void {
    this.dispatchChange(anomaly, 'opinion', { opinion: { id: `OP-${Date.now()}`, specialist: '当前用户', ...this.opinionForm, conclusion: '补充证据', createdAt: new Date().toISOString() } })
  }
  savePlan(anomaly: Anomaly): void {
    this.dispatchChange(anomaly, 'savePlan', { plan: { id: anomaly.plan.id, ...this.planForm, emergencyLinked: anomaly.plan.emergencyLinked, approvedBy: '', approvedAt: '' } })
  }
  approve(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.approvePlan({ anomalyId: anomaly.id, approver: '负责人 何清', note: '同意执行，严格执行关闭条件。' })) }
  emergency(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.createEmergencyLink({ anomalyId: anomaly.id, note: '重大异常联动应急值班，通知下游巡查。' })) }
  close(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.closeAnomaly({ anomalyId: anomaly.id, note: '复测数据稳定，关闭条件已满足。' })) }
  reconfirm(anomaly: Anomaly): void { this.store.dispatch(TailingsActions.reconfirmAnomaly({ anomalyId: anomaly.id, note: '现场复核与新版阈值一致，继续按方案执行。' })) }
  resolve(anomalyId: string, conflictId: string, side: 'console' | 'incoming'): void { this.store.dispatch(TailingsActions.resolveConflict({ anomalyId, conflictId, side })) }
}

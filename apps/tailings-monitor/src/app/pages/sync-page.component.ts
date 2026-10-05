import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import type { Anomaly, AnomalyChangeKind } from '../domain'
import { FIELD_LABELS, kindLabel } from '../domain'
import { TailingsActions } from '../store/tailings.actions'
import { selectActiveStation, selectAnomalies, selectMergeReports, selectNetworkOnline, selectOutbox, selectPendingConflicts, selectStations } from '../store/tailings.selectors'

@Component({
  selector: 'app-sync-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule],
  template: `
    <section class="page">
      <div class="head"><div><h2>汛期值班交接与离线合并</h2><p>离线巡检终端的复核与处置意见先留在本地待办，回到内网恢复网络后继续重试并与值班台三方合并；晚到记录不覆盖已签批方案，字段冲突两边版本都保留。</p></div></div>

      <div class="control-band">
        <mat-form-field appearance="outline"><mat-label>当前值班台/终端</mat-label>
          <mat-select [value]="(station$ | async)?.id" (selectionChange)="setStation($event.value)">
            <mat-option *ngFor="let item of stations$ | async" [value]="item.id">{{ item.name }}（{{ item.operator }}）</mat-option>
          </mat-select>
        </mat-form-field>
        <div class="net" [class.offline]="!online"><span class="dot"></span>{{ online ? '内网在线' : '离线（记录暂存本地）' }}</div>
        <button mat-stroked-button color="primary" (click)="goOffline()" [disabled]="!online">模拟断网</button>
        <button mat-flat-button color="primary" (click)="goOnline()" [disabled]="online">恢复网络</button>
        <button mat-flat-button color="accent" (click)="sync()" [disabled]="!online || (outbox$ | async)?.length === 0">重试并合并全部待办</button>
      </div>

      <div class="grid">
        <div class="panel">
          <h3>终端本地待办（{{ (outbox$ | async)?.length || 0 }}）</h3>
          <p class="hint" *ngIf="(outbox$ | async)?.length === 0">暂无本地待办。切到巡检终端并断网，在“异常处置”页提交复核/意见/方案即在此暂存。</p>
          <table mat-table [dataSource]="outbox$ | async">
            <ng-container matColumnDef="title"><th mat-header-cell *matHeaderCellDef>异常 / 类型</th><td mat-cell *matCellDef="let row"><b>{{ row.anomalyTitle }}</b><small>{{ kind(row.kind) }} · 依据 V{{ row.baseVersion }} · {{ row.stationName }}</small></td></ng-container>
            <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row"><span [class.fail]="row.status === '上传失败'">{{ row.status }}</span><small>已重试 {{ row.attempts }} 次<ng-container *ngIf="row.lastError"> · {{ row.lastError }}</ng-container></small></td></ng-container>
            <ng-container matColumnDef="op"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let row"><button mat-button color="primary" [disabled]="!online" (click)="retry(row.id)">重试</button></td></ng-container>
            <tr mat-header-row *matHeaderRowDef="outboxCols"></tr><tr mat-row *matRowDef="let row; columns: outboxCols"></tr>
          </table>
        </div>

        <div class="panel demo">
          <h3>并发场景演示</h3>
          <p class="hint">在终端断网暂存改动后，用下面按钮模拟内网值班台B同时修改同一异常，再恢复网络合并。</p>
          <mat-form-field appearance="outline" class="full"><mat-label>选择异常</mat-label>
            <mat-select [(ngModel)]="targetAnomalyId"><mat-option *ngFor="let item of anomalies$ | async" [value]="item.id">{{ item.id }} {{ item.title }}</mat-option></mat-select>
          </mat-form-field>
          <div class="demo-buttons">
            <button mat-stroked-button (click)="consoleChangeStatus()">值班台B：先签批/改状态</button>
            <button mat-stroked-button (click)="consoleApprove()">值班台B：签批处置方案</button>
            <button mat-stroked-button (click)="consoleChangeOwner()">值班台B：改责任方/条件</button>
          </div>
          <ul class="legend-note">
            <li>终端“提交方案”遇到值班台已签批 → 晚到方案被拒绝覆盖，保留为待交接版本。</li>
            <li>同一字段两边都改 → 两个版本都保留，列入字段冲突交接。</li>
          </ul>
        </div>
      </div>

      <div class="panel conflict-panel">
        <h3>字段冲突交接中心（{{ (conflicts$ | async)?.length || 0 }}）</h3>
        <p class="hint" *ngIf="(conflicts$ | async)?.length === 0">没有待交接的字段冲突。</p>
        <article *ngFor="let item of conflicts$ | async">
          <div class="cf-head"><b>{{ item.anomaly.id }} · {{ field(item.conflict.field) }}</b><span>晚到来源：{{ item.conflict.incomingStation }} · 基线 V{{ item.anomaly.version }}</span></div>
          <div class="cf-sides">
            <span class="base"><small>共同基线</small>{{ item.conflict.baseDigest }}</span>
            <span class="console"><small>值班台正本</small>{{ item.conflict.consoleDigest }}</span>
            <span class="incoming"><small>晚到版本（已留存）</small>{{ item.conflict.incomingDigest }}</span>
          </div>
          <div class="cf-actions"><button mat-flat-button color="primary" (click)="resolve(item.anomaly.id, item.conflict.id, 'console')">交接采用值班台</button><button mat-stroked-button (click)="resolve(item.anomaly.id, item.conflict.id, 'incoming')">交接采用晚到版本</button></div>
        </article>
      </div>

      <div class="panel">
        <h3>合并报告</h3>
        <table mat-table [dataSource]="reports$ | async">
          <ng-container matColumnDef="at"><th mat-header-cell *matHeaderCellDef>时间</th><td mat-cell *matCellDef="let row">{{ row.at.replace('T', ' ').slice(5, 16) }}</td></ng-container>
          <ng-container matColumnDef="station"><th mat-header-cell *matHeaderCellDef>来源</th><td mat-cell *matCellDef="let row"><small>{{ row.stationName }}</small></td></ng-container>
          <ng-container matColumnDef="anomaly"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let row">{{ row.anomalyId }}</td></ng-container>
          <ng-container matColumnDef="kind"><th mat-header-cell *matHeaderCellDef>类型</th><td mat-cell *matCellDef="let row">{{ kind(row.kind) }}</td></ng-container>
          <ng-container matColumnDef="result"><th mat-header-cell *matHeaderCellDef>结果</th><td mat-cell *matCellDef="let row"><span [class.r-ok]="row.result === '已合并'" [class.r-warn]="row.result === '冲突待交接'" [class.r-guard]="row.result.startsWith('已拒绝')">{{ row.result }}</span></td></ng-container>
          <ng-container matColumnDef="detail"><th mat-header-cell *matHeaderCellDef>说明</th><td mat-cell *matCellDef="let row"><small>{{ row.detail }}</small></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="reportCols"></tr><tr mat-row *matRowDef="let row; columns: reportCols"></tr>
        </table>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.head h2 { margin: 0 0 5px; font-size: 20px; }.head p { margin: 0 0 14px; color: #72807d; font-size: 12px; max-width: 980px; }
    .control-band { display: flex; align-items: center; gap: 12px; background: white; border: 1px solid #d9e1df; padding: 12px 16px; margin-bottom: 14px; flex-wrap: wrap; }.control-band mat-form-field { width: 260px; }
    .net { display: flex; align-items: center; gap: 7px; font-size: 12px; color: #2e5b4f; background: #e7f3ee; padding: 8px 12px; }.net .dot { width: 9px; height: 9px; border-radius: 50%; background: #2e8b63; }.net.offline { color: #8a5a18; background: #f8efd9; }.net.offline .dot { background: #c28d27; }
    .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; margin-bottom: 14px; }.panel { background: white; border: 1px solid #d9e1df; padding: 14px 16px; margin-bottom: 14px; }.panel h3 { margin: 0 0 10px; font-size: 14px; }.hint { color: #8a9794; font-size: 11px; margin: 0 0 10px; } table { width: 100%; } small { color: #7c8986; font-size: 10px; }
    .demo .full { width: 100%; }.demo-buttons { display: grid; gap: 8px; margin: 6px 0 10px; }.legend-note { margin: 0; padding-left: 16px; color: #7c6a2c; font-size: 11px; line-height: 1.7; }
    td span.fail, .r-warn { color: #a23b34; font-weight: 600; }.r-guard { color: #8a6720; font-weight: 600; }.r-ok { color: #2e765a; font-weight: 600; }
    .conflict-panel article { border: 1px solid #e3b9b5; background: #fdf3f2; padding: 10px 12px; margin-bottom: 9px; }.cf-head { display: flex; justify-content: space-between; margin-bottom: 8px; }.cf-head span { color: #9a7a77; font-size: 11px; }.cf-sides { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 8px; }.cf-sides span { font-size: 12px; padding: 7px 9px; background: white; border: 1px solid #e2c9c7; }.cf-sides small { display: block; margin-bottom: 3px; }.cf-sides .incoming { border-style: dashed; border-color: #b84038; }.cf-actions { display: flex; gap: 8px; justify-content: flex-end; }
  `]
})
export class SyncPageComponent {
  private readonly store = inject(Store)
  readonly station$ = this.store.select(selectActiveStation)
  readonly stations$ = this.store.select(selectStations)
  online = true
  readonly outbox$ = this.store.select(selectOutbox)
  readonly reports$ = this.store.select(selectMergeReports)
  readonly conflicts$ = this.store.select(selectPendingConflicts)
  readonly anomalies$ = this.store.select(selectAnomalies)
  readonly outboxCols = ['title', 'status', 'op']
  readonly reportCols = ['at', 'station', 'anomaly', 'kind', 'result', 'detail']
  targetAnomalyId = ''
  private readonly onlineSub = this.store.select(selectNetworkOnline).subscribe((online) => (this.online = online))
  private readonly anomalySub = this.anomalies$.subscribe((items) => { if (!this.targetAnomalyId && items[0]) this.targetAnomalyId = items[0].id })

  kind(value: AnomalyChangeKind): string { return kindLabel(value) }
  field(value: keyof typeof FIELD_LABELS): string { return FIELD_LABELS[value] }
  setStation(id: string): void { this.store.dispatch(TailingsActions.setStation({ stationId: id })) }
  goOffline(): void { this.store.dispatch(TailingsActions.goOffline()) }
  goOnline(): void { this.store.dispatch(TailingsActions.goOnline()) }
  sync(): void { this.store.dispatch(TailingsActions.syncOutbox()) }
  retry(itemId: string): void { this.store.dispatch(TailingsActions.retryOutboxItem({ itemId })) }
  resolve(anomalyId: string, conflictId: string, side: 'console' | 'incoming'): void { this.store.dispatch(TailingsActions.resolveConflict({ anomalyId, conflictId, side })) }

  private target(): string { return this.targetAnomalyId || '' }
  consoleChangeStatus(): void {
    this.store.dispatch(TailingsActions.simulateConsoleEdit({ anomalyId: this.target(), kind: 'emergency', payload: { note: '值班台B判定需要应急联动' }, label: '启动应急联动' }))
  }
  consoleApprove(): void {
    this.store.dispatch(TailingsActions.simulateConsoleEdit({ anomalyId: this.target(), kind: 'approve', payload: { approver: '负责人 何清', note: '值班台B在线签批' }, label: '签批处置方案' }))
  }
  consoleChangeOwner(): void {
    const anomaly = this.anomaliesSnapshot()
    if (!anomaly) return
    this.store.dispatch(TailingsActions.simulateConsoleEdit({
      anomalyId: this.target(),
      kind: 'savePlan',
      payload: { plan: { ...anomaly.plan, owner: '应急抢险班', conditions: '值班台B修订：库水位先降0.5m再恢复常态监测。', approvedBy: '', approvedAt: '' } },
      label: '改责任方与关闭条件'
    }))
  }
  private anomaliesSnapshot(): Anomaly | undefined {
    let value: Anomaly | undefined
    this.anomalies$.subscribe((items) => (value = items.find((item) => item.id === this.targetAnomalyId))).unsubscribe()
    return value
  }
}

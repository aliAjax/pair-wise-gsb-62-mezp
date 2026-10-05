import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import { TailingsApiService } from '../services/tailings-api.service'
import { anomalyBasis } from '../services/sync-engine'
import { selectDataset } from '../store/tailings.selectors'

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatTableModule],
  template: `
    <section class="page">
      <div class="head"><div><h2>审计与版本追溯</h2><p>异常创建、原始读数、现场复核、专业意见、处置方案、审批、合并交接、阈值重算和关闭全部留痕。</p></div><button mat-flat-button color="primary" (click)="exportPackage()">导出审阅包</button></div>

      <div class="basis-card">
        <h3>审阅包版本依据（与列表、异常详情一致）</h3>
        <p class="rev">数据集修订号 R{{ (dataset$ | async)?.revision }}；当前阈值：
          <ng-container *ngFor="let t of (dataset$ | async)?.thresholds; let last = last"><b>{{ t.id }} V{{ t.version }}</b><ng-container *ngIf="!last"> · </ng-container></ng-container>
        </p>
        <table mat-table [dataSource]="basisRows$ | async" class="basis-table">
          <ng-container matColumnDef="anomalyId"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let row">{{ row.anomalyId }}</td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>状态</th><td mat-cell *matCellDef="let row">{{ row.status }}</td></ng-container>
          <ng-container matColumnDef="basis"><th mat-header-cell *matHeaderCellDef>阈值版本依据</th><td mat-cell *matCellDef="let row"><span class="lock">{{ row.locked ? '🔒 ' : '' }}{{ row.thresholdId }} V{{ row.thresholdVersion }}</span></td></ng-container>
          <ng-container matColumnDef="note"><th mat-header-cell *matHeaderCellDef>说明</th><td mat-cell *matCellDef="let row">{{ row.note }}</td></ng-container>
          <tr mat-header-row *matHeaderRowDef="basisColumns"></tr><tr mat-row *matRowDef="let row; columns: basisColumns"></tr>
        </table>
      </div>

      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索实体、动作、操作人</mat-label><input matInput [(ngModel)]="keyword" /></mat-form-field><span>共{{ (filtered$ | async)?.length }}条事件</span></div>
      <table mat-table [dataSource]="filtered$ | async" class="panel">
        <ng-container matColumnDef="time"><th mat-header-cell *matHeaderCellDef>时间</th><td mat-cell *matCellDef="let row">{{ row.createdAt.replace('T', ' ').slice(0, 16) }}</td></ng-container>
        <ng-container matColumnDef="entity"><th mat-header-cell *matHeaderCellDef>实体</th><td mat-cell *matCellDef="let row">{{ row.entityId }}</td></ng-container>
        <ng-container matColumnDef="action"><th mat-header-cell *matHeaderCellDef>动作</th><td mat-cell *matCellDef="let row"><span class="action" [class.warn]="row.action.includes('冲突') || row.action.includes('重算') || row.action.includes('保护')">{{ row.action }}</span></td></ng-container>
        <ng-container matColumnDef="operator"><th mat-header-cell *matHeaderCellDef>操作人</th><td mat-cell *matCellDef="let row">{{ row.operator }}</td></ng-container>
        <ng-container matColumnDef="detail"><th mat-header-cell *matHeaderCellDef>说明</th><td mat-cell *matCellDef="let row">{{ row.detail }}</td></ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }.head h2 { margin: 0 0 5px; font-size: 20px; }.head p { margin: 0; color: #72807d; font-size: 12px; }.toolbar { display: flex; align-items: center; gap: 12px; margin-top: 12px; }.toolbar span { color: #74827f; font-size: 11px; }.panel { width: 100%; background: white; border: 1px solid #d9e1df; }
    .basis-card { background: white; border: 1px solid #d9e1df; border-left: 4px solid #315d6e; padding: 14px 16px; } .basis-card h3 { margin: 0 0 6px; font-size: 14px; color: #245060; } .rev { margin: 0 0 10px; font-size: 11px; color: #72807d; } .rev b { color: #315d6e; } .basis-table .lock { font-size: 11px; color: #46534f; }
    .action.warn { color: #b4611d; font-weight: 600; }
  `]
})
export class AuditPageComponent {
  private readonly store = inject(Store)
  private readonly api = inject(TailingsApiService)
  keyword = ''
  readonly columns = ['time', 'entity', 'action', 'operator', 'detail']
  readonly basisColumns = ['anomalyId', 'status', 'basis', 'note']
  readonly dataset$ = this.store.select(selectDataset)
  readonly basisRows$ = this.dataset$.pipe(map((dataset) => dataset.anomalies.map((anomaly) => {
    const basis = anomalyBasis(dataset, anomaly)
    return {
      anomalyId: anomaly.id,
      status: anomaly.status,
      thresholdId: basis.thresholdId,
      thresholdVersion: basis.thresholdVersion,
      locked: anomaly.status === '已关闭',
      note: anomaly.status === '已关闭'
        ? `结案锁定阈值V${basis.thresholdVersion}，证据按原版查看${basis.newerAvailable ? `（当前已到V${basis.currentVersion}）` : ''}`
        : basis.newerAvailable ? `已发布新版V${basis.currentVersion}，等待重算确认` : '跟随当前生效版本'
    }
  })))
  readonly filtered$ = this.store.select(selectDataset).pipe(map((dataset) => dataset.audit.filter((item) => !this.keyword || `${item.entityId} ${item.action} ${item.operator} ${item.detail}`.includes(this.keyword))))

  exportPackage(): void {
    this.store.select(selectDataset).subscribe((dataset) => {
      const payload = this.api.reviewPackage(dataset)
      this.api.exportPackage(payload).subscribe((blob) => {
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `尾矿库审阅包_R${dataset.revision}.json`; anchor.click(); URL.revokeObjectURL(url)
      })
    }).unsubscribe()
  }
}

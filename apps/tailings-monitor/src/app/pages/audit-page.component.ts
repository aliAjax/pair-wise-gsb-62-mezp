import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { combineLatest, map, take } from 'rxjs'
import { buildReviewPackage } from '../domain'
import { TailingsApiService } from '../services/tailings-api.service'
import { selectActiveStation, selectAnomalyBases, selectDataset, selectMergeReports } from '../store/tailings.selectors'

@Component({
  selector: 'app-audit-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatTableModule],
  template: `
    <section class="page">
      <div class="head"><div><h2>审计与版本追溯</h2><p>异常创建、原始读数、现场复核、专业意见、处置方案、签批、阈值重算和交接全部留痕；审阅包内含每个异常实际依据的阈值版本。</p></div><button mat-flat-button color="primary" (click)="exportPackage()">导出审阅包</button></div>

      <h3>版本依据一致性（列表 / 详情 / 审阅包同口径）</h3>
      <table mat-table [dataSource]="bases$ | async" class="panel basis-table">
        <ng-container matColumnDef="anomalyId"><th mat-header-cell *matHeaderCellDef>异常</th><td mat-cell *matCellDef="let row">{{ row.anomalyId }} · V{{ row.anomalyVersion }}</td></ng-container>
        <ng-container matColumnDef="basis"><th mat-header-cell *matHeaderCellDef>阈值依据</th><td mat-cell *matCellDef="let row">{{ row.basis.thresholdId }} V{{ row.basis.version }} <span [class.frozen]="row.basis.frozen">（{{ row.basis.frozen ? '结案冻结' : '现行' }}）</span></td></ng-container>
        <ng-container matColumnDef="values"><th mat-header-cell *matHeaderCellDef>预警/报警/速率</th><td mat-cell *matCellDef="let row">{{ row.basis.warning }} / {{ row.basis.alarm }} / {{ row.basis.changeRate }} {{ row.basis.unit }}</td></ng-container>
        <ng-container matColumnDef="conflicts"><th mat-header-cell *matHeaderCellDef>待交接</th><td mat-cell *matCellDef="let row">{{ row.pendingConflicts }}</td></ng-container>
        <tr mat-header-row *matHeaderRowDef="basisCols"></tr><tr mat-row *matRowDef="let row; columns: basisCols"></tr>
      </table>

      <div class="toolbar"><mat-form-field appearance="outline"><mat-label>搜索实体、动作、操作人</mat-label><input matInput [(ngModel)]="keyword" /></mat-form-field><span>共{{ (filtered$ | async)?.length }}条事件</span></div>
      <table mat-table [dataSource]="filtered$ | async" class="panel">
        <ng-container matColumnDef="time"><th mat-header-cell *matHeaderCellDef>时间</th><td mat-cell *matCellDef="let row">{{ row.createdAt.replace('T', ' ').slice(0, 16) }}</td></ng-container>
        <ng-container matColumnDef="entity"><th mat-header-cell *matHeaderCellDef>实体</th><td mat-cell *matCellDef="let row">{{ row.entityId }}</td></ng-container>
        <ng-container matColumnDef="action"><th mat-header-cell *matHeaderCellDef>动作</th><td mat-cell *matCellDef="let row">{{ row.action }}</td></ng-container>
        <ng-container matColumnDef="operator"><th mat-header-cell *matHeaderCellDef>操作人</th><td mat-cell *matCellDef="let row">{{ row.operator }}</td></ng-container>
        <ng-container matColumnDef="detail"><th mat-header-cell *matHeaderCellDef>说明</th><td mat-cell *matCellDef="let row">{{ row.detail }}</td></ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr><tr mat-row *matRowDef="let row; columns: columns"></tr>
      </table>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }.head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }.head h2 { margin: 0 0 5px; font-size: 20px; }.head p { margin: 0; color: #72807d; font-size: 12px; max-width: 820px; }h3 { font-size: 14px; margin: 16px 0 8px; }.toolbar { display: flex; align-items: center; gap: 12px; margin-top: 16px; }.toolbar span { color: #72807d; font-size: 11px; }.panel { width: 100%; background: white; border: 1px solid #d9e1df; }.basis-table { margin-bottom: 6px; }.frozen { color: #8a6720; }
  `]
})
export class AuditPageComponent {
  private readonly store = inject(Store)
  private readonly api = inject(TailingsApiService)
  keyword = ''
  readonly columns = ['time', 'entity', 'action', 'operator', 'detail']
  readonly basisCols = ['anomalyId', 'basis', 'values', 'conflicts']
  readonly bases$ = this.store.select(selectAnomalyBases)
  private readonly dataset$ = this.store.select(selectDataset)
  private readonly reports$ = this.store.select(selectMergeReports)
  private readonly station$ = this.store.select(selectActiveStation)
  readonly filtered$ = this.store.select(selectDataset).pipe(map((dataset) => dataset.audit.filter((item) => !this.keyword || `${item.entityId} ${item.action} ${item.operator} ${item.detail}`.includes(this.keyword))))

  exportPackage(): void {
    combineLatest({ dataset: this.dataset$, reports: this.reports$, station: this.station$ }).pipe(
      take(1),
      map(({ dataset, reports, station }) => buildReviewPackage(dataset, reports, station, new Date().toISOString()))
    ).subscribe((pkg) => {
      this.api.exportPackage(pkg).subscribe((blob) => {
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = '尾矿库监测审阅包.json'; anchor.click(); URL.revokeObjectURL(url)
      })
    })
  }
}

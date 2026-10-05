import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Observable, catchError, of } from 'rxjs'
import type { TailingsDataset } from '../domain'
import { seedDataset } from '../data/seed'
import { buildReviewPackage, type ReviewPackage } from './sync-engine'

@Injectable({ providedIn: 'root' })
export class TailingsApiService {
  private readonly http = inject(HttpClient)
  private readonly baseUrl = (globalThis as { __TAILINGS_API__?: string }).__TAILINGS_API__ ?? '/api'

  loadDataset(): Observable<TailingsDataset> {
    return this.http.get<TailingsDataset>(`${this.baseUrl}/tailings/snapshot`).pipe(catchError(() => of(structuredClone(seedDataset))))
  }

  exportPackage(payload: ReviewPackage): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/tailings/export`, payload, { responseType: 'blob' }).pipe(catchError(() => of(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))))
  }

  /** 审阅包封装：列表、详情、导出共用同一版本依据 */
  reviewPackage(dataset: TailingsDataset): ReviewPackage {
    return buildReviewPackage(dataset, new Date().toISOString())
  }
}

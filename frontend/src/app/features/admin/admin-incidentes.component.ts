import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, IncidenteMasivo } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-incidentes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="inc">
      <div class="inc-header">
        <div>
          <h2 class="inc-title">Incidentes masivos</h2>
          <p class="inc-sub">Problemas que afectan a múltiples tiendas simultáneamente.</p>
        </div>
        <div class="inc-actions">
          <select class="select" [(ngModel)]="filtroEstado" (ngModelChange)="load()">
            <option value="">Todos</option>
            <option value="ACTIVO">Activos</option>
            <option value="CERRADO">Cerrados</option>
          </select>
          <button class="btn btn--primary" (click)="mostrarForm.set(true)">+ Nuevo incidente</button>
        </div>
      </div>

      <!-- Formulario nuevo incidente -->
      @if (mostrarForm()) {
        <div class="card form-card">
          <h3 class="form-title">Nuevo incidente masivo</h3>
          <div class="form-grid">
            <div class="form-field form-field--full">
              <label>Título *</label>
              <input class="input" [(ngModel)]="nuevoTitulo" placeholder="Ej: Caída de internet en Zona Norte" />
            </div>
            <div class="form-field form-field--full">
              <label>Descripción</label>
              <textarea class="input" [(ngModel)]="nuevoDesc" rows="3" placeholder="Contexto del incidente…"></textarea>
            </div>
          </div>
          <div class="form-footer">
            <button class="btn btn--outline" (click)="cancelarForm()">Cancelar</button>
            <button class="btn btn--primary" (click)="crear()" [disabled]="!nuevoTitulo.trim() || saving()">
              {{ saving() ? 'Guardando…' : 'Crear incidente' }}
            </button>
          </div>
          @if (error()) {
            <p class="error-msg">{{ error() }}</p>
          }
        </div>
      }

      <!-- Lista -->
      @if (loading()) {
        <div class="empty-state">Cargando incidentes…</div>
      } @else if (incidentes().length === 0) {
        <div class="empty-state">
          @if (filtroEstado) {
            No hay incidentes en estado "{{ filtroEstado }}".
          } @else {
            No hay incidentes registrados.
          }
        </div>
      } @else {
        <div class="inc-list">
          @for (inc of incidentes(); track inc.id) {
            <div class="inc-card" [class.inc-card--cerrado]="inc.estado === 'CERRADO'">
              <div class="inc-card-main">
                <div class="inc-card-left">
                  <span class="estado-badge" [class]="'estado-badge--' + inc.estado">
                    {{ inc.estado }}
                  </span>
                  <div class="inc-titulo">{{ inc.titulo }}</div>
                  @if (inc.descripcion) {
                    <div class="inc-desc">{{ inc.descripcion }}</div>
                  }
                </div>
                <div class="inc-card-right">
                  <div class="inc-stat">
                    <span class="inc-stat-value">{{ inc.impacto_tiendas }}</span>
                    <span class="inc-stat-label">tiendas</span>
                  </div>
                  <div class="inc-fecha">{{ inc.fecha_inicio | date:'dd/MM/yy HH:mm' }}</div>
                  @if (inc.estado === 'ACTIVO') {
                    <button class="btn btn--sm btn--danger" (click)="cerrar(inc)" [disabled]="cerrando() === inc.id">
                      {{ cerrando() === inc.id ? '…' : 'Cerrar incidente' }}
                    </button>
                  } @else {
                    <div class="inc-fecha">Cerrado: {{ inc.fecha_cierre | date:'dd/MM/yy HH:mm' }}</div>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .inc { }
    .inc-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      margin-bottom: 20px; gap: 12px;
    }
    .inc-title { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
    .inc-sub { font-size: 13px; color: var(--c-muted); margin: 0; }
    .inc-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }

    .select {
      padding: 8px 12px; border: 1px solid var(--c-border); border-radius: var(--radius-md);
      font-size: 13px; background: white; cursor: pointer;
    }

    .btn { padding: 8px 16px; border-radius: var(--radius-md); font-size: 13px; cursor: pointer; border: none; font-weight: 500; }
    .btn--sm { padding: 6px 12px; font-size: 12px; }
    .btn--primary { background: var(--c-blue); color: white; }
    .btn--primary:hover { opacity: .9; }
    .btn--outline { background: transparent; border: 1px solid var(--c-border); color: var(--c-text); }
    .btn--outline:hover { background: var(--c-bg); }
    .btn--danger { background: var(--c-red); color: white; }
    .btn--danger:hover { opacity: .9; }
    .btn:disabled { opacity: .5; cursor: not-allowed; }

    .card { background: white; border: 1px solid var(--c-border); border-radius: var(--radius-lg); padding: 20px; }
    .form-card { margin-bottom: 20px; }
    .form-title { font-size: 16px; font-weight: 600; margin: 0 0 16px; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-field { display: flex; flex-direction: column; gap: 4px; }
    .form-field--full { grid-column: 1 / -1; }
    .form-field label { font-size: 12px; font-weight: 500; color: var(--c-muted); }
    .input {
      padding: 8px 12px; border: 1px solid var(--c-border); border-radius: var(--radius-md);
      font-size: 13px; width: 100%; box-sizing: border-box; font-family: inherit;
      transition: border-color var(--transition);
    }
    .input:focus { outline: none; border-color: var(--c-blue); }
    textarea.input { resize: vertical; }
    .form-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .error-msg { color: var(--c-red); font-size: 13px; margin-top: 8px; }

    .empty-state { text-align: center; padding: 60px 20px; color: var(--c-muted); }

    .inc-list { display: flex; flex-direction: column; gap: 10px; }

    .inc-card {
      background: white; border: 1px solid var(--c-border);
      border-radius: var(--radius-lg); border-left: 4px solid var(--c-red);
      overflow: hidden; transition: box-shadow var(--transition);
    }
    .inc-card:hover { box-shadow: var(--shadow-md); }
    .inc-card--cerrado { border-left-color: var(--c-border); opacity: .75; }

    .inc-card-main {
      display: flex; align-items: flex-start;
      justify-content: space-between; padding: 16px 20px; gap: 16px;
    }
    .inc-card-left { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .inc-titulo { font-size: 15px; font-weight: 600; }
    .inc-desc { font-size: 13px; color: var(--c-muted); }
    .inc-card-right {
      display: flex; flex-direction: column; align-items: flex-end;
      gap: 8px; flex-shrink: 0; min-width: 120px;
    }
    .inc-stat { display: flex; flex-direction: column; align-items: flex-end; }
    .inc-stat-value { font-size: 24px; font-weight: 700; color: var(--c-blue); line-height: 1; }
    .inc-stat-label { font-size: 11px; color: var(--c-muted); }
    .inc-fecha { font-size: 11px; color: var(--c-muted); }

    .estado-badge {
      display: inline-block; padding: 2px 8px; border-radius: 99px;
      font-size: 11px; font-weight: 700; width: fit-content;
    }
    .estado-badge--ACTIVO { background: #FFEBEE; color: var(--c-red); }
    .estado-badge--CERRADO { background: var(--c-bg); color: var(--c-muted); }
  `],
})
export class AdminIncidentesComponent implements OnInit {
  incidentes = signal<IncidenteMasivo[]>([]);
  loading = signal(true);
  saving = signal(false);
  cerrando = signal<number | null>(null);
  error = signal('');
  mostrarForm = signal(false);
  filtroEstado = '';

  nuevoTitulo = '';
  nuevoDesc = '';

  constructor(private adminService: AdminService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.adminService.getIncidentes(this.filtroEstado || undefined).subscribe({
      next: data => { this.incidentes.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  cancelarForm() {
    this.mostrarForm.set(false);
    this.nuevoTitulo = '';
    this.nuevoDesc = '';
    this.error.set('');
  }

  crear() {
    if (!this.nuevoTitulo.trim()) return;
    this.saving.set(true);
    this.error.set('');
    this.adminService.createIncidente({
      titulo: this.nuevoTitulo.trim(),
      descripcion: this.nuevoDesc.trim() || undefined,
    }).subscribe({
      next: inc => {
        this.incidentes.update(list => [inc, ...list]);
        this.saving.set(false);
        this.cancelarForm();
      },
      error: (e: any) => {
        this.error.set(e?.error?.detail ?? 'Error al crear el incidente');
        this.saving.set(false);
      },
    });
  }

  cerrar(inc: IncidenteMasivo) {
    this.cerrando.set(inc.id);
    this.adminService.updateIncidente(inc.id, { estado: 'CERRADO' }).subscribe({
      next: updated => {
        this.incidentes.update(list => list.map(i => i.id === updated.id ? updated : i));
        this.cerrando.set(null);
      },
      error: () => this.cerrando.set(null),
    });
  }
}

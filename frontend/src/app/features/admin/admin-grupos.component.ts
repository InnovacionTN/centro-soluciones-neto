import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AdminService, GrupoAdmin, UsuarioAdmin } from '../../core/services/admin.service';

interface CompaniaSimple { id: number; nombre: string; activo: boolean; }

@Component({
  selector: 'app-admin-grupos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="grupos-page">

      <!-- Header -->
      <div class="page-header">
        <div class="page-header-left">
          <h2 class="page-title">Grupos del Call Center</h2>
          <span class="total-chip">{{ grupos().length }} grupos · {{ agentes().length }} agentes</span>
        </div>
        <div class="page-header-right">
          <!-- Filtros área -->
          <div class="filter-pills">
            <button class="pill" [class.pill--active]="filtroArea() === ''" (click)="filtroArea.set('')">Todos</button>
            @for (a of areas; track a) {
              <button class="pill" [class.pill--active]="filtroArea() === a" (click)="filtroArea.set(a)">{{ a }}</button>
            }
          </div>
          <button class="btn-primary" (click)="openModal()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo grupo
          </button>
        </div>
      </div>

      <!-- Cards de grupos -->
      @if (loading()) {
        <div class="skeleton-list">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="skeleton-card">
              <div class="sk sk--title"></div>
              <div class="sk sk--sub"></div>
            </div>
          }
        </div>
      } @else {
        <div class="cards-list">
          @for (grupo of gruposPadre(); track grupo.id) {
            <div class="grupo-card" [class.grupo-card--open]="isOpen(grupo.id)">

              <!-- Card Header -->
              <div class="grupo-card__head" (click)="toggle(grupo.id)">
                <div class="grupo-icon" [class]="iconClass(grupo.area_tecnica)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>

                <div class="grupo-card__info">
                  <div class="grupo-card__name">{{ grupo.nombre }}</div>
                  <div class="grupo-card__meta">
                    <span class="area-badge" [class]="areaBadgeClass(grupo.area_tecnica)">{{ grupo.area_tecnica }}</span>
                    <span class="meta-dot">·</span>
                    <span class="meta-item">{{ agentesDelGrupo(grupo.id).length }} agente{{ agentesDelGrupo(grupo.id).length !== 1 ? 's' : '' }}</span>
                    @if (subgruposDe(grupo).length > 0) {
                      <span class="meta-dot">·</span>
                      <span class="meta-item">{{ subgruposDe(grupo).length }} subgrupo{{ subgruposDe(grupo).length !== 1 ? 's' : '' }}</span>
                    }
                  </div>
                </div>

                <div class="grupo-card__actions" (click)="$event.stopPropagation()">
                  <button class="icon-btn" title="Editar" (click)="openModal(grupo)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="icon-btn icon-btn--danger" title="{{ grupo.activo ? 'Desactivar' : 'Activar' }}" (click)="toggleActivo(grupo)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      @if (grupo.activo) {
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>
                      } @else {
                        <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
                      }
                    </svg>
                  </button>
                </div>

                <svg class="chevron" [class.chevron--open]="isOpen(grupo.id)"
                     width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              <!-- Expandido -->
              @if (isOpen(grupo.id)) {
                <div class="grupo-card__body">

                  <!-- Agentes directos del grupo padre -->
                  @if (agentesDelGrupo(grupo.id).length > 0) {
                    <div class="body-section">
                      <div class="body-section-title">Agentes directos</div>
                      <div class="agentes-grid">
                        @for (ag of agentesDelGrupo(grupo.id); track ag.id) {
                          <div class="agente-chip" [class.agente-chip--off]="!ag.activo">
                            <div class="agente-avatar">{{ ag.nombre.charAt(0) }}</div>
                            <span class="agente-nombre">{{ ag.nombre }}</span>
                            @if (!ag.activo) { <span class="inactivo-mark">inactivo</span> }
                          </div>
                        }
                      </div>
                    </div>
                  }

                  <!-- Subgrupos por compañía -->
                  @if (subgruposDe(grupo).length > 0) {
                    <div class="body-section">
                      <div class="body-section-title">Subgrupos por compañía</div>
                      <div class="subgrupos-list">
                        @for (sub of subgruposDe(grupo); track sub.id) {
                          <div class="subgrupo-row">
                            <div class="subgrupo-left">
                              <span class="compania-badge">{{ sub.compania?.nombre ?? '—' }}</span>
                              <span class="subgrupo-nombre">{{ sub.nombre }}</span>
                            </div>
                            <div class="subgrupo-agentes">
                              @for (ag of agentesDelGrupo(sub.id); track ag.id) {
                                <div class="avatar-sm" [title]="ag.nombre" [class.avatar-sm--off]="!ag.activo">
                                  {{ ag.nombre.charAt(0) }}
                                </div>
                              }
                              @if (agentesDelGrupo(sub.id).length === 0) {
                                <span class="sin-agentes">Sin agentes</span>
                              }
                              <span class="count-label">{{ agentesDelGrupo(sub.id).length }}</span>
                            </div>
                            <div class="subgrupo-actions">
                              <button class="icon-btn" (click)="openModal(sub)">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  }

                  @if (agentesDelGrupo(grupo.id).length === 0 && subgruposDe(grupo).length === 0) {
                    <div class="empty-body">Sin agentes ni subgrupos asignados</div>
                  }
                </div>
              }

            </div>
          }
        </div>
      }
    </div>

    <!-- ── Modal ────────────────────────────────────────────────── -->
    @if (showModal()) {
      <div class="modal-backdrop" (click)="closeModal()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3 class="modal-title">{{ editId() ? 'Editar grupo' : 'Nuevo grupo' }}</h3>
            <button class="modal-close" (click)="closeModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="field-group">
              <label class="field-label">Nombre <span class="req">*</span></label>
              <input class="field-input" [(ngModel)]="form.nombre" placeholder="Ej: Sistemas: Soporte NORTE" />
            </div>
            <div class="fields-row">
              <div class="field-group">
                <label class="field-label">Área técnica <span class="req">*</span></label>
                <select class="field-input" [(ngModel)]="form.area_tecnica">
                  <option value="">Selecciona...</option>
                  @for (a of areas; track a) { <option [value]="a">{{ a }}</option> }
                </select>
              </div>
              <div class="field-group">
                <label class="field-label">Compañía (subgrupo)</label>
                <select class="field-input" [(ngModel)]="form.compania_id">
                  <option [ngValue]="null">Nacional</option>
                  @for (c of companias(); track c.id) {
                    <option [ngValue]="c.id">{{ c.nombre }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label">Canal de Slack</label>
              <input class="field-input" [(ngModel)]="form.slack_canal" placeholder="#cc-sistemas-soporte" />
            </div>
            @if (formError()) {
              <div class="form-error">{{ formError() }}</div>
            }
          </div>
          <div class="modal-footer">
            <button class="btn-ghost" (click)="closeModal()">Cancelar</button>
            <button class="btn-primary" [class.btn-primary--loading]="saving()" [disabled]="saving()" (click)="save()">
              @if (saving()) { <span class="spinner"></span> } @else { {{ editId() ? 'Guardar cambios' : 'Crear grupo' }} }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* ── Layout ── */
    .grupos-page { display: flex; flex-direction: column; gap: 20px; }

    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 12px;
    }
    .page-header-left { display: flex; align-items: center; gap: 10px; }
    .page-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .page-title { font-size: 18px; font-weight: 700; color: var(--c-text); }
    .total-chip {
      font-size: 12px; color: var(--c-muted);
      background: var(--c-bg); border: 1px solid var(--c-border);
      border-radius: 20px; padding: 3px 10px;
    }

    /* ── Filtros ── */
    .filter-pills { display: flex; gap: 6px; flex-wrap: wrap; }
    .pill {
      padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--c-border); background: var(--c-surface);
      color: var(--c-muted); cursor: pointer; transition: all .15s;
    }
    .pill:hover { border-color: var(--c-blue-md); color: var(--c-blue); }
    .pill--active { background: var(--c-blue-lt); border-color: var(--c-blue-md); color: var(--c-blue); font-weight: 600; }

    /* ── Botones ── */
    .btn-primary {
      display: flex; align-items: center; gap: 7px;
      padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
      background: var(--c-blue); color: white; border: none; cursor: pointer;
      transition: all .15s; box-shadow: 0 2px 8px rgba(14,59,131,.25);
    }
    .btn-primary:hover { background: #0c3270; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(14,59,131,.35); }
    .btn-primary:disabled { opacity: .6; cursor: not-allowed; transform: none; }
    .btn-primary--loading { pointer-events: none; }

    .btn-ghost {
      padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 500;
      background: transparent; color: var(--c-muted);
      border: 1px solid var(--c-border); cursor: pointer; transition: all .15s;
    }
    .btn-ghost:hover { background: var(--c-bg); color: var(--c-text); }

    .icon-btn {
      width: 28px; height: 28px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      background: transparent; border: 1px solid var(--c-border);
      color: var(--c-muted); cursor: pointer; transition: all .15s;
    }
    .icon-btn:hover { background: var(--c-bg); color: var(--c-text); border-color: var(--c-border-md); }
    .icon-btn--danger:hover { background: var(--c-red-lt); color: var(--c-red); border-color: var(--c-red-md); }

    /* ── Skeleton ── */
    .skeleton-list { display: flex; flex-direction: column; gap: 10px; }
    .skeleton-card {
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 12px; padding: 20px 24px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .sk { border-radius: 6px; background: linear-gradient(90deg, var(--c-border) 25%, var(--c-subtle) 50%, var(--c-border) 75%);
      background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    .sk--title { height: 16px; width: 40%; }
    .sk--sub { height: 12px; width: 25%; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* ── Cards ── */
    .cards-list { display: flex; flex-direction: column; gap: 10px; }

    .grupo-card {
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 12px; overflow: hidden;
      transition: box-shadow .2s, border-color .2s;
    }
    .grupo-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.07); }
    .grupo-card--open { border-color: var(--c-blue-md); box-shadow: 0 4px 20px rgba(14,59,131,.08); }

    .grupo-card__head {
      display: flex; align-items: center; gap: 14px;
      padding: 16px 20px; cursor: pointer; user-select: none;
      transition: background .15s;
    }
    .grupo-card__head:hover { background: var(--c-bg); }

    .grupo-icon {
      width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .icon--sistemas  { background: var(--c-blue-lt); color: var(--c-blue); }
    .icon--abasto    { background: var(--c-green-lt); color: var(--c-green); }
    .icon--mant      { background: var(--c-amber-lt); color: var(--c-amber); }
    .icon--finanzas  { background: var(--c-teal-lt); color: var(--c-teal); }
    .icon--default   { background: var(--c-purple-lt); color: var(--c-purple); }

    .grupo-card__info { flex: 1; min-width: 0; }
    .grupo-card__name { font-size: 15px; font-weight: 600; color: var(--c-text); }
    .grupo-card__meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; flex-wrap: wrap; }

    .area-badge {
      font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px;
      text-transform: uppercase; letter-spacing: .03em;
    }
    .badge--sistemas  { background: var(--c-blue-lt); color: var(--c-blue); }
    .badge--abasto    { background: var(--c-green-lt); color: var(--c-green); }
    .badge--mant      { background: var(--c-amber-lt); color: var(--c-amber); }
    .badge--finanzas  { background: var(--c-teal-lt); color: var(--c-teal); }
    .badge--default   { background: var(--c-purple-lt); color: var(--c-purple); }

    .meta-dot { color: var(--c-border); font-size: 14px; }
    .meta-item { font-size: 13px; color: var(--c-muted); }

    .grupo-card__actions { display: flex; gap: 6px; }

    .chevron { color: var(--c-muted); transition: transform .25s cubic-bezier(.4,0,.2,1); flex-shrink: 0; }
    .chevron--open { transform: rotate(180deg); color: var(--c-blue); }

    /* ── Body expandido ── */
    .grupo-card__body {
      border-top: 1px solid var(--c-border);
      background: var(--c-bg);
      padding: 16px 20px;
      display: flex; flex-direction: column; gap: 16px;
      animation: body-in .2s ease;
    }
    @keyframes body-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }

    .body-section { display: flex; flex-direction: column; gap: 10px; }
    .body-section-title { font-size: 11px; font-weight: 700; color: var(--c-muted); text-transform: uppercase; letter-spacing: .06em; }

    /* Agentes directos */
    .agentes-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .agente-chip {
      display: flex; align-items: center; gap: 8px;
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 20px; padding: 5px 12px 5px 6px;
      transition: border-color .15s;
    }
    .agente-chip:hover { border-color: var(--c-blue-md); }
    .agente-chip--off { opacity: .5; }
    .agente-avatar {
      width: 24px; height: 24px; border-radius: 50%;
      background: var(--c-blue-lt); color: var(--c-blue);
      font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
    }
    .agente-nombre { font-size: 13px; font-weight: 500; color: var(--c-text); }
    .inactivo-mark { font-size: 10px; color: var(--c-muted); background: var(--c-border); border-radius: 4px; padding: 1px 5px; }

    /* Subgrupos */
    .subgrupos-list { display: flex; flex-direction: column; gap: 6px; }
    .subgrupo-row {
      display: flex; align-items: center; gap: 12px;
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 8px; padding: 10px 14px;
      transition: border-color .15s, box-shadow .15s;
    }
    .subgrupo-row:hover { border-color: var(--c-blue-md); box-shadow: 0 2px 8px rgba(14,59,131,.06); }
    .subgrupo-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
    .compania-badge {
      font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 10px;
      background: var(--c-blue); color: white; white-space: nowrap; flex-shrink: 0;
    }
    .subgrupo-nombre { font-size: 13px; font-weight: 500; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .subgrupo-agentes { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .avatar-sm {
      width: 26px; height: 26px; border-radius: 50%;
      background: var(--c-blue-lt); color: var(--c-blue);
      font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      border: 2px solid var(--c-surface);
      margin-left: -6px; transition: transform .15s;
    }
    .avatar-sm:first-child { margin-left: 0; }
    .avatar-sm:hover { transform: translateY(-2px); z-index: 1; }
    .avatar-sm--off { opacity: .4; }
    .count-label { font-size: 12px; color: var(--c-muted); font-weight: 600; margin-left: 4px; }
    .sin-agentes { font-size: 12px; color: var(--c-muted); font-style: italic; }
    .subgrupo-actions { flex-shrink: 0; }

    .empty-body { font-size: 13px; color: var(--c-muted); text-align: center; padding: 8px 0; }

    /* ── Modal ── */
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(6, 20, 27, .45);
      backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      animation: backdrop-in .15s ease;
    }
    @keyframes backdrop-in { from { opacity: 0; } to { opacity: 1; } }

    .modal {
      background: var(--c-surface); border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0,0,0,.2);
      width: 100%; max-width: 520px;
      animation: modal-in .2s cubic-bezier(.34,1.56,.64,1);
      overflow: hidden;
    }
    @keyframes modal-in { from { opacity: 0; transform: scale(.92) translateY(8px); } to { opacity: 1; transform: none; } }

    .modal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--c-border);
    }
    .modal-title { font-size: 16px; font-weight: 700; color: var(--c-text); }
    .modal-close {
      width: 30px; height: 30px; border-radius: 8px; border: none;
      background: transparent; color: var(--c-muted); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s, color .15s;
    }
    .modal-close:hover { background: var(--c-red-lt); color: var(--c-red); }

    .modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }

    .field-group { display: flex; flex-direction: column; gap: 5px; }
    .fields-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field-label { font-size: 12px; font-weight: 600; color: var(--c-text); }
    .req { color: var(--c-red); }
    .field-input {
      padding: 9px 12px; border-radius: 8px; font-size: 14px;
      border: 1.5px solid var(--c-border); background: var(--c-bg);
      color: var(--c-text); transition: border-color .15s, box-shadow .15s;
      width: 100%;
    }
    .field-input:focus { outline: none; border-color: var(--c-blue); box-shadow: 0 0 0 3px rgba(14,59,131,.12); }

    .form-error {
      padding: 10px 14px; border-radius: 8px;
      background: var(--c-red-lt); color: var(--c-red);
      font-size: 13px; border: 1px solid var(--c-red-md);
    }

    .modal-footer {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 16px 24px 20px;
      border-top: 1px solid var(--c-border);
    }

    .spinner {
      width: 14px; height: 14px; border-radius: 50%;
      border: 2px solid rgba(255,255,255,.3);
      border-top-color: white;
      animation: spin .6s linear infinite; display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class AdminGruposComponent implements OnInit {
  grupos    = signal<GrupoAdmin[]>([]);
  agentes   = signal<UsuarioAdmin[]>([]);
  companias = signal<CompaniaSimple[]>([]);
  loading   = signal(true);
  saving    = signal(false);
  showModal = signal(false);
  editId    = signal<number | null>(null);
  formError = signal('');
  filtroArea = signal('');
  openIds   = signal<Set<number>>(new Set());

  areas = ['SISTEMAS', 'ABASTO', 'MANTENIMIENTO', 'FINANZAS', 'COMERCIAL', 'RRHH', 'OPERACIONES'];

  form = this.emptyForm();

  // Solo grupos sin compañía (padres)
  gruposPadre = computed(() => {
    const list = this.grupos().filter(g => !g.compania_id);
    return this.filtroArea() ? list.filter(g => g.area_tecnica === this.filtroArea()) : list;
  });

  subgruposDe(padre: GrupoAdmin): GrupoAdmin[] {
    return this.grupos()
      .filter(g => g.compania_id && g.nombre.startsWith(padre.nombre + ' '))
      .sort((a, b) => (a.compania?.nombre ?? '').localeCompare(b.compania?.nombre ?? ''));
  }

  agentesDelGrupo(grupoId: number): UsuarioAdmin[] {
    return this.agentes().filter(a => a.grupo_id === grupoId);
  }

  isOpen(id: number) { return this.openIds().has(id); }
  toggle(id: number) {
    this.openIds.update(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  iconClass(area: string) {
    const map: Record<string, string> = {
      SISTEMAS: 'grupo-icon icon--sistemas',
      ABASTO: 'grupo-icon icon--abasto',
      MANTENIMIENTO: 'grupo-icon icon--mant',
      FINANZAS: 'grupo-icon icon--finanzas',
    };
    return map[area] ?? 'grupo-icon icon--default';
  }

  areaBadgeClass(area: string) {
    const map: Record<string, string> = {
      SISTEMAS: 'area-badge badge--sistemas',
      ABASTO: 'area-badge badge--abasto',
      MANTENIMIENTO: 'area-badge badge--mant',
      FINANZAS: 'area-badge badge--finanzas',
    };
    return map[area] ?? 'area-badge badge--default';
  }

  constructor(private admin: AdminService, private http: HttpClient) { }

  ngOnInit() {
    this.load();
    this.http.get<CompaniaSimple[]>('/api/v1/admin/companias').subscribe({ next: cs => this.companias.set(cs), error: () => {} });
    this.admin.getUsuarios('AGENTE').subscribe({ next: us => this.agentes.set(us), error: () => {} });
  }

  load() {
    this.loading.set(true);
    this.admin.getGrupos().subscribe({
      next: gs => { this.grupos.set(gs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  emptyForm() {
    return { nombre: '', area_tecnica: '', slack_canal: '', compania_id: null as number | null };
  }

  openModal(g?: GrupoAdmin) {
    this.form = g
      ? { nombre: g.nombre, area_tecnica: g.area_tecnica, slack_canal: g.slack_canal ?? '', compania_id: g.compania_id }
      : this.emptyForm();
    this.editId.set(g?.id ?? null);
    this.formError.set('');
    this.showModal.set(true);
  }

  closeModal() { this.showModal.set(false); }

  save() {
    if (!this.form.nombre.trim() || !this.form.area_tecnica) {
      this.formError.set('Nombre y área técnica son obligatorios');
      return;
    }
    this.saving.set(true);
    const req = this.editId()
      ? this.admin.updateGrupo(this.editId()!, this.form)
      : this.admin.createGrupo(this.form);
    req.subscribe({
      next: () => { this.saving.set(false); this.closeModal(); this.load(); },
      error: err => { this.saving.set(false); this.formError.set(err.error?.detail ?? 'Error al guardar'); },
    });
  }

  toggleActivo(g: GrupoAdmin) {
    this.admin.updateGrupo(g.id, { activo: !g.activo }).subscribe({
      next: () => this.load(),
    });
  }
}

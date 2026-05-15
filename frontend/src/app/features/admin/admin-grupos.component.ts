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
    <div class="grupos-page" (click)="closeAddDropdown()">

      <!-- ── Header ── -->
      <div class="page-header">
        <div class="header-left">
          <div class="title-row">
            <h2 class="page-title">Grupos</h2>
            <button class="tip-btn"
              data-tooltip="Los Grupos organizan a los agentes por área técnica y compañía. El sistema asigna tickets automáticamente al grupo más específico según zona, región y compañía de la tienda solicitante.">?</button>
            <span class="total-chip">{{ grupos().length }} grupos · {{ totalMiembros() }} miembros</span>
          </div>
          <div class="filter-pills">
            <button class="pill" [class.pill--active]="filtroArea() === ''" (click)="filtroArea.set('')">Todos</button>
            @for (a of areas; track a) {
              <button class="pill" [class.pill--active]="filtroArea() === a" (click)="filtroArea.set(a)">
                <span class="pill-dot" [class]="dotClass(a)"></span>{{ a }}
              </button>
            }
          </div>
        </div>
        <button class="btn-primary" (click)="openModal()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo grupo
        </button>
      </div>

      <!-- ── Skeleton ── -->
      @if (loading()) {
        <div class="skeleton-list">
          @for (i of [1,2,3,4]; track i) {
            <div class="skeleton-card">
              <div class="sk sk--icon"></div>
              <div class="sk-content">
                <div class="sk sk--title"></div>
                <div class="sk sk--sub"></div>
              </div>
            </div>
          }
        </div>

      } @else if (gruposPadre().length === 0) {
        <div class="empty-state">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p>No hay grupos en esta área</p>
        </div>

      } @else {
        <div class="cards-list">
          @for (grupo of gruposPadre(); track grupo.id) {
            <div class="grupo-card" [class.grupo-card--open]="isOpen(grupo.id)" [class.grupo-card--inactive]="!grupo.activo">

              <!-- ── Head ── -->
              <div class="grupo-card__head" (click)="toggle(grupo.id)">
                <div class="grupo-icon" [class]="iconClass(grupo.area_tecnica)">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>

                <div class="grupo-card__info">
                  <div class="name-row">
                    <span class="grupo-card__name">{{ grupo.nombre }}</span>
                    @if (!grupo.activo) { <span class="inactive-tag">Inactivo</span> }
                  </div>
                  <div class="grupo-card__meta">
                    <span class="area-badge" [class]="areaBadgeClass(grupo.area_tecnica)">{{ grupo.area_tecnica }}</span>
                    <span class="meta-sep">·</span>
                    <span class="meta-item">{{ agentesDe(grupo.id).length + coordinadoresDe(grupo.id).length }} miembro{{ (agentesDe(grupo.id).length + coordinadoresDe(grupo.id).length) !== 1 ? 's' : '' }}</span>
                    @if (subgruposDe(grupo).length > 0) {
                      <span class="meta-sep">·</span>
                      <span class="meta-item">{{ subgruposDe(grupo).length }} subgrupo{{ subgruposDe(grupo).length !== 1 ? 's' : '' }}</span>
                    }
                    @if (grupo.slack_canal) {
                      <span class="meta-sep">·</span>
                      <span class="meta-item meta-slack">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
                        {{ grupo.slack_canal }}
                      </span>
                    }
                  </div>
                </div>

                <div class="grupo-card__actions" (click)="$event.stopPropagation()">
                  <button class="icon-btn" title="Editar grupo" (click)="openModal(grupo)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="icon-btn" [class.icon-btn--danger]="grupo.activo" [title]="grupo.activo ? 'Desactivar grupo' : 'Activar grupo'" (click)="toggleActivo(grupo)">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      @if (grupo.activo) {
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>
                      } @else {
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      }
                    </svg>
                  </button>
                </div>

                <svg class="chevron" [class.chevron--open]="isOpen(grupo.id)"
                     width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              <!-- ── Body ── -->
              @if (isOpen(grupo.id)) {
                <div class="grupo-card__body">

                  <!-- Coordinadores -->
                  @if (coordinadoresDe(grupo.id).length > 0) {
                    <div class="body-section">
                      <div class="section-hdr">
                        <span class="section-title">Coordinadores</span>
                        <button class="tip-btn tip-btn--xs"
                          data-tooltip="Coordinadores son responsables del grupo. Supervisan tickets y gestionan la carga de trabajo de los agentes.">?</button>
                      </div>
                      <div class="members-wrap">
                        @for (u of coordinadoresDe(grupo.id); track u.id) {
                          <div class="member-chip member-chip--coord">
                            <div class="m-avatar m-avatar--coord">{{ initials(u.nombre) }}</div>
                            <span class="m-nombre">{{ u.nombre }}</span>
                            <span class="role-pill">Coord.</span>
                          </div>
                        }
                      </div>
                    </div>
                  }

                  <!-- Agentes directos -->
                  <div class="body-section">
                    <div class="section-hdr">
                      <span class="section-title">Agentes</span>
                      <button class="tip-btn tip-btn--xs"
                        data-tooltip="Agentes que reciben y atienden tickets de este grupo. Puedes agregar o quitar miembros desde aquí.">?</button>
                      <span class="count-pill">{{ agentesDe(grupo.id).length }}</span>
                    </div>
                    <div class="members-wrap">
                      @for (ag of agentesDe(grupo.id); track ag.id) {
                        <div class="member-chip" [class.member-chip--off]="!ag.activo">
                          <div class="m-avatar">{{ initials(ag.nombre) }}</div>
                          <span class="m-nombre">{{ ag.nombre }}</span>
                          @if (!ag.activo) { <span class="inactivo-tag">inactivo</span> }
                          <button class="chip-x" title="Quitar del grupo" (click)="removeAgent(ag)">×</button>
                        </div>
                      }
                      <!-- Add agent -->
                      <div class="add-wrap" (click)="$event.stopPropagation()">
                        <button class="chip-add" (click)="openAddDropdown(grupo.id)">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Agregar agente
                        </button>
                        @if (addingToGroup() === grupo.id) {
                          <div class="add-dropdown">
                            <input class="add-search" [(ngModel)]="searchVal" (input)="searchSig.set(searchVal)" placeholder="Buscar por nombre…" />
                            <div class="add-list">
                              @for (ag of disponibles(grupo.id); track ag.id) {
                                <button class="add-opt" (click)="assignAgent(ag.id, grupo.id)">
                                  <div class="opt-av">{{ initials(ag.nombre) }}</div>
                                  <div class="opt-info">
                                    <span class="opt-name">{{ ag.nombre }}</span>
                                    <span class="opt-sub">{{ ag.grupo_id ? 'Reasignar desde otro grupo' : 'Sin grupo asignado' }}</span>
                                  </div>
                                </button>
                              }
                              @if (disponibles(grupo.id).length === 0) {
                                <div class="add-empty">Sin agentes que coincidan</div>
                              }
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                    @if (agentesDe(grupo.id).length === 0) {
                      <p class="no-members">Sin agentes asignados directamente a este grupo.</p>
                    }
                  </div>

                  <!-- Subgrupos -->
                  @if (subgruposDe(grupo).length > 0) {
                    <div class="body-section">
                      <div class="section-hdr">
                        <span class="section-title">Subgrupos por compañía</span>
                        <button class="tip-btn tip-btn--xs"
                          data-tooltip="Cada subgrupo atiende tickets de tiendas de una compañía específica. El ruteo automático los prioriza sobre el grupo general nacional.">?</button>
                        <span class="count-pill">{{ subgruposDe(grupo).length }}</span>
                      </div>
                      <div class="subgrupos-list">
                        @for (sub of subgruposDe(grupo); track sub.id) {
                          <div class="subgrupo-card">
                            <div class="subgrupo-head">
                              <span class="compania-tag">{{ sub.compania?.nombre ?? '—' }}</span>
                              <span class="sub-nombre">{{ sub.nombre }}</span>
                              <span class="sub-count">{{ agentesDe(sub.id).length + coordinadoresDe(sub.id).length }} miembro{{ (agentesDe(sub.id).length + coordinadoresDe(sub.id).length) !== 1 ? 's' : '' }}</span>
                              <button class="icon-btn icon-btn--xs" title="Editar subgrupo" (click)="openModal(sub); $event.stopPropagation()">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            </div>
                            <div class="subgrupo-members">
                              @for (u of coordinadoresDe(sub.id); track u.id) {
                                <div class="member-chip member-chip--sub member-chip--coord">
                                  <div class="m-avatar m-avatar--sm m-avatar--coord">{{ initials(u.nombre) }}</div>
                                  <span class="m-nombre m-nombre--sm">{{ u.nombre }}</span>
                                  <span class="role-pill role-pill--sm">Coord.</span>
                                  <button class="chip-x chip-x--sm" title="Quitar" (click)="removeAgent(u); $event.stopPropagation()">×</button>
                                </div>
                              }
                              @for (ag of agentesDe(sub.id); track ag.id) {
                                <div class="member-chip member-chip--sub" [class.member-chip--off]="!ag.activo">
                                  <div class="m-avatar m-avatar--sm">{{ initials(ag.nombre) }}</div>
                                  <span class="m-nombre m-nombre--sm">{{ ag.nombre }}</span>
                                  @if (!ag.activo) { <span class="inactivo-tag">inactivo</span> }
                                  <button class="chip-x chip-x--sm" title="Quitar del subgrupo" (click)="removeAgent(ag); $event.stopPropagation()">×</button>
                                </div>
                              }
                              <!-- Add to subgroup -->
                              <div class="add-wrap" (click)="$event.stopPropagation()">
                                <button class="chip-add chip-add--sm" (click)="openAddDropdown(sub.id)">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                  Agregar
                                </button>
                                @if (addingToGroup() === sub.id) {
                                  <div class="add-dropdown add-dropdown--up">
                                    <input class="add-search" [(ngModel)]="searchVal" (input)="searchSig.set(searchVal)" placeholder="Buscar por nombre…" />
                                    <div class="add-list">
                                      @for (ag of disponibles(sub.id); track ag.id) {
                                        <button class="add-opt" (click)="assignAgent(ag.id, sub.id)">
                                          <div class="opt-av">{{ initials(ag.nombre) }}</div>
                                          <div class="opt-info">
                                            <span class="opt-name">{{ ag.nombre }}</span>
                                            <span class="opt-sub">{{ ag.grupo_id ? 'Reasignar desde otro grupo' : 'Sin grupo asignado' }}</span>
                                          </div>
                                        </button>
                                      }
                                      @if (disponibles(sub.id).length === 0) {
                                        <div class="add-empty">Sin agentes que coincidan</div>
                                      }
                                    </div>
                                  </div>
                                }
                              </div>
                              @if (agentesDe(sub.id).length === 0 && coordinadoresDe(sub.id).length === 0) {
                                <span class="sin-miembros">Sin miembros</span>
                              }
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  }

                  @if (coordinadoresDe(grupo.id).length === 0 && agentesDe(grupo.id).length === 0 && subgruposDe(grupo).length === 0) {
                    <div class="body-empty">Sin miembros ni subgrupos asignados a este grupo.</div>
                  }
                </div>
              }

            </div>
          }
        </div>
      }
    </div>

    <!-- ── Modal ── -->
    @if (showModal()) {
      <div class="modal-backdrop" (click)="closeModal()">
        <div class="modal" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div>
              <h3 class="modal-title">{{ editId() ? 'Editar grupo' : 'Nuevo grupo' }}</h3>
              <p class="modal-sub">{{ editId() ? 'Actualiza la configuración del grupo' : 'Define el nombre, área y compañía del nuevo grupo' }}</p>
            </div>
            <button class="modal-close" (click)="closeModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">

            <div class="field">
              <div class="field-lbl-row">
                <label class="field-lbl">Nombre <span class="req">*</span></label>
                <button class="tip-btn tip-btn--xs"
                  data-tooltip="Nombre único del grupo. Para subgrupos, inicia con el nombre del grupo padre seguido de la región. Ej: 'Sistemas: Soporte CENTRO'">?</button>
              </div>
              <input class="field-inp" [(ngModel)]="form.nombre" placeholder="Ej: Sistemas: Soporte NORTE" />
            </div>

            <div class="fields-2col">
              <div class="field">
                <div class="field-lbl-row">
                  <label class="field-lbl">Área técnica <span class="req">*</span></label>
                  <button class="tip-btn tip-btn--xs"
                    data-tooltip="Define qué dirección es responsable de este grupo. Determina qué tipos de tickets puede recibir y cómo lo filtra el sistema.">?</button>
                </div>
                <select class="field-inp" [(ngModel)]="form.area_tecnica">
                  <option value="">Selecciona...</option>
                  @for (a of areas; track a) { <option [value]="a">{{ a }}</option> }
                </select>
              </div>
              <div class="field">
                <div class="field-lbl-row">
                  <label class="field-lbl">Compañía</label>
                  <button class="tip-btn tip-btn--xs"
                    data-tooltip="'Nacional' = grupo general. Al seleccionar una compañía creas un subgrupo que atiende exclusivamente tiendas de esa compañía. El ruteo lo prioriza sobre el grupo nacional.">?</button>
                </div>
                <select class="field-inp" [(ngModel)]="form.compania_id">
                  <option [ngValue]="null">Nacional (grupo general)</option>
                  @for (c of companias(); track c.id) {
                    <option [ngValue]="c.id">{{ c.nombre }}</option>
                  }
                </select>
              </div>
            </div>

            <div class="field">
              <div class="field-lbl-row">
                <label class="field-lbl">Canal de Slack</label>
                <button class="tip-btn tip-btn--xs"
                  data-tooltip="Canal donde se enviarán alertas cuando se asigne un ticket a este grupo. Formato: #nombre-del-canal">?</button>
              </div>
              <input class="field-inp" [(ngModel)]="form.slack_canal" placeholder="#cc-sistemas-soporte" />
            </div>

            @if (formError()) {
              <div class="form-err">{{ formError() }}</div>
            }
          </div>
          <div class="modal-footer">
            <button class="btn-ghost" (click)="closeModal()">Cancelar</button>
            <button class="btn-primary" [disabled]="saving()" (click)="save()">
              @if (saving()) { <span class="spinner"></span> } @else { {{ editId() ? 'Guardar cambios' : 'Crear grupo' }} }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* ── Page ── */
    .grupos-page { display: flex; flex-direction: column; gap: 20px; }

    /* ── Header ── */
    .page-header {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    }
    .header-left { display: flex; flex-direction: column; gap: 10px; }
    .title-row { display: flex; align-items: center; gap: 8px; }
    .page-title { font-size: 20px; font-weight: 700; color: var(--c-text); margin: 0; }
    .total-chip {
      font-size: 12px; color: var(--c-muted);
      background: var(--c-bg); border: 1px solid var(--c-border);
      border-radius: 20px; padding: 3px 10px;
    }

    /* ── Tooltip button ── */
    .tip-btn {
      width: 18px; height: 18px; border-radius: 50%;
      border: 1.5px solid var(--c-border); background: var(--c-bg);
      color: var(--c-muted); font-size: 10px; font-weight: 700;
      cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      position: relative; flex-shrink: 0;
      transition: border-color .15s, color .15s, background .15s;
    }
    .tip-btn:hover { border-color: var(--c-blue); color: var(--c-blue); background: var(--c-blue-lt); }
    .tip-btn--xs { width: 15px; height: 15px; font-size: 9px; }

    /* Tooltip popup via ::after */
    .tip-btn::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%; transform: translateX(-50%);
      background: #1a2c42; color: #dde8f4;
      padding: 9px 13px; border-radius: 9px;
      font-size: 12px; font-weight: 400; line-height: 1.55;
      white-space: pre-wrap; width: 260px; text-align: left;
      box-shadow: 0 6px 24px rgba(0,0,0,.3);
      opacity: 0; pointer-events: none;
      transition: opacity .15s; z-index: 500;
    }
    .tip-btn:hover::after { opacity: 1; }

    /* ── Filter pills ── */
    .filter-pills { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .pill {
      display: flex; align-items: center; gap: 5px;
      padding: 5px 13px; border-radius: 20px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--c-border); background: var(--c-surface);
      color: var(--c-muted); cursor: pointer; transition: all .15s;
    }
    .pill:hover { border-color: var(--c-blue-md); color: var(--c-blue); }
    .pill--active { background: var(--c-blue-lt); border-color: var(--c-blue-md); color: var(--c-blue); font-weight: 600; }
    .pill-dot {
      width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
    }
    .dot--sistemas { background: var(--c-blue); }
    .dot--abasto   { background: var(--c-green); }
    .dot--mant     { background: var(--c-amber); }
    .dot--finanzas { background: var(--c-teal); }
    .dot--default  { background: var(--c-purple); }

    /* ── Buttons ── */
    .btn-primary {
      display: flex; align-items: center; gap: 7px;
      padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
      background: var(--c-blue); color: white; border: none; cursor: pointer;
      transition: all .15s; box-shadow: 0 2px 8px rgba(14,59,131,.25);
      white-space: nowrap;
    }
    .btn-primary:hover { background: #0c3270; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(14,59,131,.35); }
    .btn-primary:disabled { opacity: .6; cursor: not-allowed; transform: none; }

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
    .icon-btn--xs { width: 22px; height: 22px; border-radius: 5px; }

    /* ── Skeleton ── */
    .skeleton-list { display: flex; flex-direction: column; gap: 10px; }
    .skeleton-card {
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 12px; padding: 18px 20px;
      display: flex; align-items: center; gap: 14px;
    }
    .sk-content { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .sk {
      border-radius: 6px;
      background: linear-gradient(90deg, var(--c-border) 25%, var(--c-subtle) 50%, var(--c-border) 75%);
      background-size: 200% 100%; animation: shimmer 1.4s infinite;
    }
    .sk--icon  { width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0; }
    .sk--title { height: 15px; width: 45%; }
    .sk--sub   { height: 11px; width: 30%; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      padding: 48px 20px; color: var(--c-muted); text-align: center;
    }
    .empty-state svg { opacity: .35; }
    .empty-state p { font-size: 14px; margin: 0; }

    /* ── Cards ── */
    .cards-list { display: flex; flex-direction: column; gap: 10px; }

    .grupo-card {
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 12px;
      transition: box-shadow .2s, border-color .2s;
    }
    .grupo-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.07); }
    .grupo-card--open { border-color: var(--c-blue-md); box-shadow: 0 4px 20px rgba(14,59,131,.08); }
    .grupo-card--inactive { opacity: .65; }

    .grupo-card__head {
      display: flex; align-items: center; gap: 14px;
      padding: 16px 20px; cursor: pointer; user-select: none;
      transition: background .15s;
      border-radius: 12px;
    }
    .grupo-card--open .grupo-card__head { border-radius: 12px 12px 0 0; }
    .grupo-card__head:hover { background: var(--c-bg); }

    .grupo-icon {
      width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .icon--sistemas { background: var(--c-blue-lt);   color: var(--c-blue); }
    .icon--abasto   { background: var(--c-green-lt);  color: var(--c-green); }
    .icon--mant     { background: var(--c-amber-lt);  color: var(--c-amber); }
    .icon--finanzas { background: var(--c-teal-lt);   color: var(--c-teal); }
    .icon--default  { background: var(--c-purple-lt); color: var(--c-purple); }

    .grupo-card__info { flex: 1; min-width: 0; }
    .name-row { display: flex; align-items: center; gap: 8px; }
    .grupo-card__name { font-size: 15px; font-weight: 600; color: var(--c-text); }
    .inactive-tag {
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
      padding: 2px 7px; border-radius: 6px;
      background: var(--c-red-lt); color: var(--c-red);
    }
    .grupo-card__meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
    .area-badge {
      font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px;
      text-transform: uppercase; letter-spacing: .03em;
    }
    .badge--sistemas { background: var(--c-blue-lt);   color: var(--c-blue); }
    .badge--abasto   { background: var(--c-green-lt);  color: var(--c-green); }
    .badge--mant     { background: var(--c-amber-lt);  color: var(--c-amber); }
    .badge--finanzas { background: var(--c-teal-lt);   color: var(--c-teal); }
    .badge--default  { background: var(--c-purple-lt); color: var(--c-purple); }
    .meta-sep { color: var(--c-border); font-size: 14px; }
    .meta-item { font-size: 12px; color: var(--c-muted); }
    .meta-slack { display: flex; align-items: center; gap: 4px; }

    .grupo-card__actions { display: flex; gap: 6px; flex-shrink: 0; }
    .chevron { color: var(--c-muted); transition: transform .25s cubic-bezier(.4,0,.2,1); flex-shrink: 0; }
    .chevron--open { transform: rotate(180deg); color: var(--c-blue); }

    /* ── Card body ── */
    .grupo-card__body {
      border-top: 1px solid var(--c-border);
      background: var(--c-bg);
      padding: 18px 20px;
      display: flex; flex-direction: column; gap: 20px;
      border-radius: 0 0 12px 12px;
      animation: body-in .2s ease;
    }
    @keyframes body-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

    /* ── Section ── */
    .body-section { display: flex; flex-direction: column; gap: 10px; }
    .section-hdr { display: flex; align-items: center; gap: 6px; }
    .section-title {
      font-size: 11px; font-weight: 700; color: var(--c-muted);
      text-transform: uppercase; letter-spacing: .07em;
    }
    .count-pill {
      font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 10px;
      background: var(--c-border); color: var(--c-muted);
    }

    /* ── Member chips ── */
    .members-wrap { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }

    .member-chip {
      display: flex; align-items: center; gap: 7px;
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 24px; padding: 5px 10px 5px 5px;
      transition: border-color .15s, box-shadow .15s;
    }
    .member-chip:hover { border-color: var(--c-blue-md); box-shadow: 0 1px 6px rgba(14,59,131,.1); }
    .member-chip--off { opacity: .5; }
    .member-chip--coord { border-color: var(--c-amber-md, #f5c36b); background: var(--c-amber-lt); }
    .member-chip--sub { font-size: 12.5px; }

    .m-avatar {
      width: 26px; height: 26px; border-radius: 50%;
      background: var(--c-blue-lt); color: var(--c-blue);
      font-size: 10px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; text-transform: uppercase;
    }
    .m-avatar--sm { width: 22px; height: 22px; font-size: 9px; }
    .m-avatar--coord { background: var(--c-amber-lt); color: var(--c-amber); }

    .m-nombre { font-size: 13px; font-weight: 500; color: var(--c-text); white-space: nowrap; }
    .m-nombre--sm { font-size: 12px; }

    .role-pill {
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
      padding: 2px 6px; border-radius: 6px;
      background: var(--c-amber-lt); color: var(--c-amber);
    }
    .role-pill--sm { font-size: 9px; padding: 1px 5px; }

    .inactivo-tag {
      font-size: 10px; color: var(--c-muted); background: var(--c-border);
      border-radius: 4px; padding: 1px 5px; white-space: nowrap;
    }

    .chip-x {
      width: 16px; height: 16px; border-radius: 50%;
      border: none; background: transparent;
      color: var(--c-muted); font-size: 14px; line-height: 1;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background .15s, color .15s;
    }
    .chip-x:hover { background: var(--c-red-lt); color: var(--c-red); }
    .chip-x--sm { width: 14px; height: 14px; font-size: 12px; }

    .chip-add {
      display: flex; align-items: center; gap: 5px;
      padding: 5px 11px 5px 8px; border-radius: 24px; font-size: 12px; font-weight: 600;
      border: 1.5px dashed var(--c-border); background: transparent;
      color: var(--c-muted); cursor: pointer; transition: all .15s;
    }
    .chip-add:hover { border-color: var(--c-blue); color: var(--c-blue); background: var(--c-blue-lt); }
    .chip-add--sm { padding: 4px 9px 4px 6px; font-size: 11px; }

    /* ── Add dropdown ── */
    .add-wrap { position: relative; }
    .add-dropdown {
      position: absolute; top: calc(100% + 6px); left: 0; z-index: 300;
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,.15);
      width: 260px; overflow: hidden;
      animation: drop-in .15s ease;
    }
    .add-dropdown--up { top: auto; bottom: calc(100% + 6px); }
    @keyframes drop-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
    .add-search {
      width: 100%; padding: 10px 12px; border: none;
      border-bottom: 1px solid var(--c-border);
      background: var(--c-bg); color: var(--c-text); font-size: 13px;
      outline: none;
    }
    .add-list { max-height: 200px; overflow-y: auto; }
    .add-opt {
      width: 100%; display: flex; align-items: center; gap: 10px;
      padding: 9px 12px; border: none; background: transparent;
      cursor: pointer; text-align: left; transition: background .12s;
    }
    .add-opt:hover { background: var(--c-blue-lt); }
    .opt-av {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      background: var(--c-blue-lt); color: var(--c-blue);
      font-size: 10px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      text-transform: uppercase;
    }
    .opt-info { display: flex; flex-direction: column; min-width: 0; }
    .opt-name { font-size: 13px; font-weight: 500; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .opt-sub { font-size: 11px; color: var(--c-muted); }
    .add-empty { padding: 12px; font-size: 12px; color: var(--c-muted); text-align: center; }

    .no-members { font-size: 12px; color: var(--c-muted); font-style: italic; margin: 0; }
    .body-empty { font-size: 13px; color: var(--c-muted); text-align: center; padding: 6px 0; }

    /* ── Subgrupos ── */
    .subgrupos-list { display: flex; flex-direction: column; gap: 8px; }
    .subgrupo-card {
      background: var(--c-surface); border: 1px solid var(--c-border);
      border-radius: 10px; overflow: hidden;
      transition: border-color .15s, box-shadow .15s;
    }
    .subgrupo-card:hover { border-color: var(--c-blue-md); box-shadow: 0 2px 10px rgba(14,59,131,.07); }

    .subgrupo-head {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--c-border);
      background: var(--c-bg);
    }
    .compania-tag {
      font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em;
      padding: 3px 9px; border-radius: 8px;
      background: var(--c-blue); color: white; white-space: nowrap; flex-shrink: 0;
    }
    .sub-nombre { font-size: 13px; font-weight: 600; color: var(--c-text); flex: 1; min-width: 0; }
    .sub-count { font-size: 12px; color: var(--c-muted); white-space: nowrap; flex-shrink: 0; }

    .subgrupo-members {
      display: flex; flex-wrap: wrap; gap: 7px;
      padding: 10px 14px;
      align-items: flex-start;
    }
    .sin-miembros { font-size: 12px; color: var(--c-muted); font-style: italic; align-self: center; }

    /* ── Modal ── */
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(6,20,27,.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px; animation: bd-in .15s ease;
    }
    @keyframes bd-in { from { opacity: 0; } to { opacity: 1; } }
    .modal {
      background: var(--c-surface); border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0,0,0,.22);
      width: 100%; max-width: 520px;
      animation: modal-in .2s cubic-bezier(.34,1.56,.64,1);
    }
    @keyframes modal-in { from { opacity: 0; transform: scale(.92) translateY(8px); } to { opacity: 1; transform: none; } }

    .modal-header {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 20px 24px 16px; border-bottom: 1px solid var(--c-border);
    }
    .modal-title { font-size: 16px; font-weight: 700; color: var(--c-text); margin: 0; }
    .modal-sub { font-size: 12px; color: var(--c-muted); margin: 3px 0 0; }
    .modal-close {
      width: 30px; height: 30px; border-radius: 8px; border: none;
      background: transparent; color: var(--c-muted); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s, color .15s; flex-shrink: 0;
    }
    .modal-close:hover { background: var(--c-red-lt); color: var(--c-red); }

    .modal-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
    .modal-footer {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 16px 24px 20px; border-top: 1px solid var(--c-border);
    }

    /* ── Form fields ── */
    .field { display: flex; flex-direction: column; gap: 5px; }
    .fields-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field-lbl-row { display: flex; align-items: center; gap: 5px; }
    .field-lbl { font-size: 12px; font-weight: 600; color: var(--c-text); }
    .req { color: var(--c-red); }
    .field-inp {
      padding: 9px 12px; border-radius: 8px; font-size: 14px;
      border: 1.5px solid var(--c-border); background: var(--c-bg);
      color: var(--c-text); transition: border-color .15s, box-shadow .15s; width: 100%;
    }
    .field-inp:focus { outline: none; border-color: var(--c-blue); box-shadow: 0 0 0 3px rgba(14,59,131,.12); }
    .form-err {
      padding: 10px 14px; border-radius: 8px;
      background: var(--c-red-lt); color: var(--c-red);
      font-size: 13px; border: 1px solid var(--c-red-md);
    }
    .spinner {
      width: 14px; height: 14px; border-radius: 50%;
      border: 2px solid rgba(255,255,255,.3); border-top-color: white;
      animation: spin .6s linear infinite; display: inline-block;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class AdminGruposComponent implements OnInit {
  grupos        = signal<GrupoAdmin[]>([]);
  agentes       = signal<UsuarioAdmin[]>([]);
  coordinadores = signal<UsuarioAdmin[]>([]);
  companias     = signal<CompaniaSimple[]>([]);
  loading       = signal(true);
  saving        = signal(false);
  showModal     = signal(false);
  editId        = signal<number | null>(null);
  formError     = signal('');
  filtroArea    = signal('');
  openIds       = signal<Set<number>>(new Set());
  addingToGroup = signal<number | null>(null);
  searchSig     = signal('');
  searchVal     = '';

  areas = ['SISTEMAS', 'ABASTO', 'MANTENIMIENTO', 'FINANZAS', 'COMERCIAL', 'RRHH', 'OPERACIONES'];
  form  = this.emptyForm();

  gruposPadre = computed(() => {
    const list = this.grupos().filter(g => !g.compania_id);
    return this.filtroArea() ? list.filter(g => g.area_tecnica === this.filtroArea()) : list;
  });

  totalMiembros = computed(() => this.agentes().length + this.coordinadores().length);

  subgruposDe(padre: GrupoAdmin): GrupoAdmin[] {
    return this.grupos()
      .filter(g => g.compania_id && g.nombre.startsWith(padre.nombre + ' '))
      .sort((a, b) => (a.compania?.nombre ?? '').localeCompare(b.compania?.nombre ?? ''));
  }

  coordinadoresDe(grupoId: number) { return this.coordinadores().filter(c => c.grupo_id === grupoId); }
  agentesDe(grupoId: number)       { return this.agentes().filter(a => a.grupo_id === grupoId); }

  disponibles(grupoId: number): UsuarioAdmin[] {
    const q = this.searchSig().toLowerCase();
    return this.agentes().filter(a =>
      a.grupo_id !== grupoId && (!q || a.nombre.toLowerCase().includes(q))
    );
  }

  isOpen(id: number)  { return this.openIds().has(id); }
  toggle(id: number)  {
    this.openIds.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  initials(nombre: string): string {
    const p = nombre.trim().split(/\s+/);
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : nombre.slice(0, 2).toUpperCase();
  }

  iconClass(area: string) {
    const m: Record<string,string> = { SISTEMAS:'grupo-icon icon--sistemas', ABASTO:'grupo-icon icon--abasto', MANTENIMIENTO:'grupo-icon icon--mant', FINANZAS:'grupo-icon icon--finanzas' };
    return m[area] ?? 'grupo-icon icon--default';
  }

  areaBadgeClass(area: string) {
    const m: Record<string,string> = { SISTEMAS:'area-badge badge--sistemas', ABASTO:'area-badge badge--abasto', MANTENIMIENTO:'area-badge badge--mant', FINANZAS:'area-badge badge--finanzas' };
    return m[area] ?? 'area-badge badge--default';
  }

  dotClass(area: string) {
    const m: Record<string,string> = { SISTEMAS:'dot--sistemas', ABASTO:'dot--abasto', MANTENIMIENTO:'dot--mant', FINANZAS:'dot--finanzas' };
    return 'pill-dot ' + (m[area] ?? 'dot--default');
  }

  constructor(private admin: AdminService, private http: HttpClient) {}

  ngOnInit() {
    this.load();
    this.http.get<CompaniaSimple[]>('/api/v1/admin/companias').subscribe({ next: cs => this.companias.set(cs), error: () => {} });
    this.loadMembers();
  }

  load() {
    this.loading.set(true);
    this.admin.getGrupos().subscribe({
      next: gs => { this.grupos.set(gs); this.loading.set(false); },
      error: ()  => this.loading.set(false),
    });
  }

  loadMembers() {
    this.admin.getUsuarios('AGENTE').subscribe({ next: us => this.agentes.set(us), error: () => {} });
    this.admin.getUsuarios('COORDINADOR').subscribe({ next: us => this.coordinadores.set(us), error: () => {} });
  }

  openAddDropdown(grupoId: number) {
    this.searchVal = ''; this.searchSig.set('');
    this.addingToGroup.set(grupoId);
  }

  closeAddDropdown() { this.addingToGroup.set(null); }

  assignAgent(agentId: number, grupoId: number) {
    this.admin.updateUsuario(agentId, { grupo_id: grupoId }).subscribe({
      next: () => { this.closeAddDropdown(); this.loadMembers(); },
    });
  }

  removeAgent(u: UsuarioAdmin) {
    this.admin.updateUsuario(u.id, { grupo_id: null }).subscribe({
      next: () => this.loadMembers(),
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
    this.admin.updateGrupo(g.id, { activo: !g.activo }).subscribe({ next: () => this.load() });
  }
}

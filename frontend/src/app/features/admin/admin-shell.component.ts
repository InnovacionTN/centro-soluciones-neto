import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { AdminUsuariosComponent } from './admin-usuarios.component';
import { AdminTipificacionesComponent } from './admin-tipificaciones.component';
import { AdminRuteoComponent } from './admin-ruteo.component';
import { AdminGruposComponent } from './admin-grupos.component';
import { AdminKpisComponent } from './admin-kpis.component';
import { AdminTorreComponent } from './admin-torre.component';
import { AdminIncidentesComponent } from './admin-incidentes.component';
import { AdminRegionesComponent } from './admin-regiones.component';
import { AdminZonasComponent } from './admin-zonas.component';
import { AuthService } from '../../core/services/auth.service';

type Tab = 'torre' | 'incidentes' | 'usuarios' | 'tipificaciones' | 'ruteo' | 'grupos' | 'kpis' | 'regiones' | 'zonas';

const ALL_TABS: { id: Tab; label: string; icon: string; soloAdmin?: boolean }[] = [
  { id: 'torre',          label: 'Torre de Control', icon: '🗼' },
  { id: 'incidentes',     label: 'Incidentes',       icon: '🚨' },
  { id: 'kpis',           label: 'KPIs agentes',     icon: '📊' },
  { id: 'usuarios',       label: 'Usuarios',         icon: '👤' },
  { id: 'tipificaciones', label: 'Tipificaciones',   icon: '🗂',  soloAdmin: true },
  { id: 'ruteo',          label: 'Matriz de ruteo',  icon: '🧭',  soloAdmin: true },
  { id: 'grupos',         label: 'Grupos CC',        icon: '👥' },
  { id: 'regiones',       label: 'Regiones',         icon: '🗺',  soloAdmin: true },
  { id: 'zonas',          label: 'Zonas',            icon: '📍',  soloAdmin: true },
];

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [
    CommonModule, RouterModule, NavbarComponent,
    AdminUsuariosComponent, AdminTipificacionesComponent,
    AdminRuteoComponent, AdminGruposComponent, AdminKpisComponent,
    AdminTorreComponent, AdminIncidentesComponent,
    AdminRegionesComponent, AdminZonasComponent,
  ],
  template: `
    <div class="page">
      <app-navbar section="Administración" />
      <div class="content content--wide">

        <div class="admin-header">
          <h1 class="page-title">Panel de configuración</h1>
        </div>

        <!-- Tabs -->
        <div class="admin-tabs">
          @for (tab of tabs(); track tab.id) {
            <button
              class="admin-tab"
              [class.admin-tab--active]="activeTab === tab.id"
              (click)="activeTab = tab.id"
            >
              {{ tab.icon }} {{ tab.label }}
            </button>
          }
        </div>

        <!-- Tab content -->
        <div class="admin-content">
          @if (activeTab === 'torre')          { <app-admin-torre /> }
          @if (activeTab === 'incidentes')     { <app-admin-incidentes /> }
          @if (activeTab === 'usuarios')       { <app-admin-usuarios /> }
          @if (activeTab === 'tipificaciones') { <app-admin-tipificaciones /> }
          @if (activeTab === 'ruteo')          { <app-admin-ruteo /> }
          @if (activeTab === 'grupos')         { <app-admin-grupos /> }
          @if (activeTab === 'kpis')           { <app-admin-kpis /> }
          @if (activeTab === 'regiones')       { <app-admin-regiones /> }
          @if (activeTab === 'zonas')          { <app-admin-zonas /> }
        </div>

      </div>
    </div>
  `,
  styles: [`
    .admin-header { margin-bottom: 20px; }
    .page-title { font-size: 22px; font-weight: 600; }
    .admin-tabs {
      display: flex;
      gap: 4px;
      border-bottom: 2px solid var(--c-border);
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .admin-tab {
      padding: 10px 18px;
      font-size: 14px;
      font-weight: 500;
      border: none;
      background: transparent;
      color: var(--c-muted);
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      transition: all var(--transition);
      cursor: pointer;
    }
    .admin-tab:hover { color: var(--c-text); }
    .admin-tab--active {
      color: var(--c-blue);
      border-bottom-color: var(--c-blue);
    }
  `],
})
export class AdminShellComponent {
  activeTab: Tab = 'torre';

  tabs = computed(() => {
    const esSuperAdmin = this.auth.rol() === 'ADMIN';
    return ALL_TABS.filter(t => esSuperAdmin || !t.soloAdmin);
  });

  constructor(private auth: AuthService) {}
}

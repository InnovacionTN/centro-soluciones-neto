import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Evidencia {
  id: number;
  ticket_id: number;
  nombre_archivo: string;
  url: string;
  tipo_mime: string | null;
  tamanio_bytes: number | null;
  timestamp: string;
}

@Component({
  selector: 'app-evidencias',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ev-section">
      <div class="ev-header">
        <h3 class="ev-title">
          Evidencias
          @if (evidencias().length > 0) {
            <span class="ev-count">{{ evidencias().length }}</span>
          }
        </h3>
        @if (canUpload) {
          <label class="btn btn--ghost btn--sm ev-upload-btn">
            @if (uploading()) {
              <span class="ev-spinner"></span> Subiendo...
            } @else {
              + Adjuntar
            }
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.pdf"
              multiple
              (change)="onFileSelect($event)"
              [disabled]="uploading()"
              style="display:none"
            />
          </label>
        }
      </div>

      @if (error()) {
        <div class="ev-error">⚠ {{ error() }}</div>
      }

      @if (loading()) {
        <div class="ev-loading">Cargando evidencias...</div>
      } @else if (evidencias().length === 0) {
        <p class="ev-empty">Sin evidencias adjuntas</p>
      } @else {
        <div class="ev-grid">
          @for (ev of evidencias(); track ev.id) {
            <div class="ev-item">
              @if (isImage(ev.tipo_mime)) {
                <a [href]="ev.url" target="_blank" class="ev-thumb-link">
                  <img [src]="ev.url" [alt]="ev.nombre_archivo" class="ev-thumb" />
                </a>
              } @else if (isVideo(ev.tipo_mime)) {
                <div class="ev-file ev-file--video">
                  <span class="ev-icon">🎬</span>
                  <a [href]="ev.url" target="_blank" class="ev-filename">
                    {{ ev.nombre_archivo }}
                  </a>
                </div>
              } @else {
                <div class="ev-file ev-file--doc">
                  <span class="ev-icon">📄</span>
                  <a [href]="ev.url" target="_blank" class="ev-filename">
                    {{ ev.nombre_archivo }}
                  </a>
                </div>
              }
              <div class="ev-meta">
                <span class="ev-size">{{ formatSize(ev.tamanio_bytes) }}</span>
                <span class="ev-date">{{ ev.timestamp | date:'dd/MM HH:mm' }}</span>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .ev-section { margin-top: 16px; }
    .ev-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .ev-title {
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ev-count {
      background: var(--c-blue-lt);
      color: var(--c-blue);
      font-size: 11px;
      font-weight: 700;
      padding: 1px 7px;
      border-radius: 10px;
    }
    .ev-upload-btn {
      cursor: pointer;
      position: relative;
    }
    .ev-spinner {
      width: 12px; height: 12px;
      border: 2px solid var(--c-border);
      border-top-color: var(--c-blue);
      border-radius: 50%;
      display: inline-block;
      animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .ev-error {
      background: var(--c-red-lt);
      color: var(--c-red);
      border: 1px solid var(--c-red-md);
      border-radius: var(--radius-sm);
      padding: 8px 12px;
      font-size: 12px;
      margin-bottom: 10px;
    }
    .ev-loading, .ev-empty {
      font-size: 13px;
      color: var(--c-muted);
      padding: 12px 0;
    }
    .ev-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 10px;
    }
    .ev-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ev-thumb-link { display: block; }
    .ev-thumb {
      width: 100%;
      height: 90px;
      object-fit: cover;
      border-radius: var(--radius-sm);
      border: 1px solid var(--c-border);
      cursor: pointer;
      transition: opacity var(--transition);
    }
    .ev-thumb:hover { opacity: .85; }
    .ev-file {
      height: 90px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--c-border);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px;
      background: var(--c-bg);
    }
    .ev-file--video { background: var(--c-purple-lt); border-color: var(--c-purple-md); }
    .ev-file--doc   { background: var(--c-blue-lt);   border-color: var(--c-blue-md);   }
    .ev-icon { font-size: 22px; }
    .ev-filename {
      font-size: 11px;
      text-align: center;
      color: var(--c-text);
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
      display: block;
    }
    .ev-filename:hover { text-decoration: underline; }
    .ev-meta {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: var(--c-muted);
      padding: 0 2px;
    }
  `],
})
export class EvidenciasComponent implements OnInit {
  @Input() ticketId!: number;
  @Input() canUpload = false;
  @Input() token = '';

  private readonly api = environment.apiUrl;

  evidencias = signal<Evidencia[]>([]);
  loading = signal(true);
  uploading = signal(false);
  error = signal('');

  constructor(private http: HttpClient) { }

  ngOnInit() { this.loadEvidencias(); }

  loadEvidencias() {
    this.loading.set(true);
    this.http.get<Evidencia[]>(`${this.api}/tickets/${this.ticketId}/evidencias`).subscribe({
      next: evs => { this.evidencias.set(evs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;

    this.error.set('');
    this.uploading.set(true);

    // Subir uno por uno secuencialmente
    const upload = (idx: number) => {
      if (idx >= files.length) {
        this.uploading.set(false);
        input.value = '';
        return;
      }
      const file = files[idx];
      if (file.size > 10 * 1024 * 1024) {
        this.error.set(`${file.name} supera el límite de 10 MB`);
        this.uploading.set(false);
        return;
      }
      const formData = new FormData();
      formData.append('file', file);

      this.http.post<Evidencia>(
        `${this.api}/tickets/${this.ticketId}/evidencias`,
        formData
      ).subscribe({
        next: ev => {
          this.evidencias.update(list => [...list, ev]);
          upload(idx + 1);
        },
        error: err => {
          this.error.set(err.error?.detail ?? `Error al subir ${file.name}`);
          this.uploading.set(false);
        },
      });
    };
    upload(0);
  }

  isImage(mime: string | null) {
    return mime?.startsWith('image/') ?? false;
  }
  isVideo(mime: string | null) {
    return mime?.startsWith('video/') ?? false;
  }
  formatSize(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

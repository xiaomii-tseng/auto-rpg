import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReportVisibilityService } from './report-visibility.service';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './report.component.html',
  styleUrl: './report.component.scss',
})
export class ReportComponent {
  private vis = inject(ReportVisibilityService);
  readonly visible = this.vis.visible;

  message = '';
  selectedFile: File | null = null;
  state = signal<'idle' | 'loading' | 'done' | 'error'>('idle');

  close() {
    this.vis.close();
    this.message = '';
    this.selectedFile = null;
    this.state.set('idle');
  }

  onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] ?? null;
  }

  get fileName() { return this.selectedFile?.name ?? ''; }

  async submit() {
    if (!this.message.trim()) return;
    this.state.set('loading');

    const apiUrl     = (window as any).__apiUrl as string;
    const version    = (window as any).__gameVersion as string ?? '';
    const playerName = localStorage.getItem('playerName') ?? '';

    const fd = new FormData();
    fd.append('message',    this.message.trim());
    fd.append('playerName', playerName);
    fd.append('version',    version);
    fd.append('scene',      'PrepScene');
    if (this.selectedFile) fd.append('image', this.selectedFile);

    try {
      const res = await fetch(`${apiUrl}/report`, { method: 'POST', body: fd });
      if (res.ok) {
        this.state.set('done');
        setTimeout(() => this.close(), 1800);
      } else {
        this.state.set('error');
      }
    } catch {
      this.state.set('error');
    }
  }

  retry() { this.state.set('idle'); }
}

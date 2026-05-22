import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { VersionBadge } from './shared/version-badge';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, VersionBadge],
  template: `
    <router-outlet />
    <hp-version-badge />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    // Faz <mat-icon> usar Material Symbols Outlined (MD3) por padrão.
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    // Faz <mat-icon> usar Material Symbols Outlined (MD3) por padrão.
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
  }
}

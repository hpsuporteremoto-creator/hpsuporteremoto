import { ChangeDetectionStrategy, Component } from '@angular/core';
import { APP_VERSION } from '../../version';

const REPO = 'hpsuporteremoto-creator/hpsuporteremoto';

/**
 * Selo de versão discreto, fixo no canto inferior direito de qualquer
 * tela. Mostra o short SHA do commit deployado e, em produção, linka
 * direto pro commit no GitHub. Em build local mostra apenas "dev".
 */
@Component({
  selector: 'hp-version-badge',
  template: `
    @if (isDev) {
      <span class="version" title="Build local de desenvolvimento">dev</span>
    } @else {
      <a
        class="version"
        [href]="commitUrl"
        target="_blank"
        rel="noopener"
        [title]="title"
      >v{{ version.sha }}</a>
    }
  `,
  styleUrl: './version-badge.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VersionBadge {
  protected readonly version = APP_VERSION;
  protected readonly isDev = APP_VERSION.sha === 'dev';
  protected readonly commitUrl = `https://github.com/${REPO}/commit/${APP_VERSION.shaFull}`;
  protected readonly title =
    `Commit ${APP_VERSION.sha}` +
    (APP_VERSION.builtAt ? ` · build ${APP_VERSION.builtAt}` : '') +
    ' — abrir no GitHub';
}

import { Directive, input } from '@angular/core';

/**
 * Diretiva que ensina o compilador de templates do Angular sobre o custom
 * element `<ion-icon>` do pacote `ionicons`. Não renderiza nada por conta
 * própria — apenas mapeia inputs do Angular para atributos do elemento DOM,
 * de modo que `[name]="..."` funcione com binding dinâmico e o template
 * passe pelo strict template type check.
 *
 * Os custom elements precisam ser registrados em runtime via
 * `defineCustomElements(window)` (ver main.ts).
 */
@Directive({
  selector: 'ion-icon',
  host: {
    '[attr.name]': 'name()',
    '[attr.size]': 'size()',
    '[attr.color]': 'color()',
  },
})
export class IonIcon {
  readonly name = input.required<string>();
  readonly size = input<'small' | 'large'>();
  readonly color = input<string>();
}

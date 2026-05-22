import { MatPaginatorIntl } from '@angular/material/paginator';

/**
 * MatPaginatorIntl traduzido para pt-BR. Provido globalmente em
 * app.config.ts para que todos os <mat-paginator> usem rótulos em
 * português.
 */
export function ptBrPaginatorIntl(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Itens por página';
  intl.nextPageLabel = 'Próxima página';
  intl.previousPageLabel = 'Página anterior';
  intl.firstPageLabel = 'Primeira página';
  intl.lastPageLabel = 'Última página';
  intl.getRangeLabel = (page, pageSize, length) => {
    if (length === 0 || pageSize === 0) return `0 de ${length}`;
    const start = page * pageSize;
    const end = Math.min(start + pageSize, length);
    return `${start + 1}–${end} de ${length}`;
  };
  return intl;
}

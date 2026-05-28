import type { VitrineServico } from './vitrine.types';

const SEM_CATEGORIA_SLUG = 'sem-categoria';

export function catalogItemRoute(servico: VitrineServico): string[] {
  return [
    '/catalogo',
    catalogSlug(servico.categoria?.nome ?? SEM_CATEGORIA_SLUG),
    catalogSlug(servico.nome),
  ];
}

export function catalogSlug(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'item';
}

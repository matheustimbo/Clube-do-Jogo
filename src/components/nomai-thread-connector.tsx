import styles from './nomai-thread-connector.module.css';

/**
 * Conector de thread no idioma visual da escrita Nomai (Outer Wilds).
 *
 * Um único traço contínuo: desce da direção do comentário raiz (topo/esquerda),
 * faz uma curva de quarto de volta para dentro da resposta e termina em uma
 * espiral aberta de 1,25 volta com um pequeno núcleo. Nada é desenhado solto:
 * a espiral nasce do mesmo traço, com continuidade de tangente em cada junção,
 * e nenhuma parte da figura se cruza.
 *
 * Integração sugerida (feita fora deste módulo):
 *
 *   .thread-path { position: relative; }
 *   .thread-path > .nomai { top: 2px; left: -30px; width: 26px; height: 100%; }
 *
 * O `viewBox` mede 26 × 55 e usa `xMinYMin meet`: o glifo ancora no topo do
 * gutter e acompanha a largura dele, então respostas curtas ou muito altas
 * mostram exatamente a mesma forma — a espiral nunca vira uma elipse. Com
 * `non-scaling-stroke`, a espessura do traço permanece constante em qualquer
 * altura, mantendo a hierarquia legível.
 */

/** Centro da espiral, também usado pelo núcleo. */
const SPIRAL_EYE = { x: 21.5, y: 47 } as const;

/**
 * Traço único: descida com barriga à esquerda → curva de quarto de volta para
 * a direita → espiral horária de 1,25 volta com raio decaindo 0,78 por quadrante.
 */
const NOMAI_STRAND = [
  'M 7.6 0',
  'C 5.4 6 5 13 7 19',
  'C 10.5 29.4 15.43 37.36 23.89 40.42',
  'C 27.53 41.74 27.66 46.03 26.63 48.87',
  'C 25.6 51.7 22.25 51.81 20.04 51',
  'C 17.83 50.2 17.75 47.59 18.38 45.86',
  'C 19.01 44.14 21.04 44.08 22.39 44.57',
  'C 23.73 45.05 23.78 46.64 23.4 47.69',
].join(' ');

export type NomaiThreadConnectorProps = {
  active?: boolean;
  className?: string;
};

export function NomaiThreadConnector({ active = false, className }: NomaiThreadConnectorProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="4 -1.5 26 55"
      preserveAspectRatio="xMinYMin meet"
      data-active={active || undefined}
      className={[styles.connector, active ? styles.active : null, className].filter(Boolean).join(' ')}
    >
      <g className={styles.glow}>
        <path d={NOMAI_STRAND} vectorEffect="non-scaling-stroke" />
        <circle cx={SPIRAL_EYE.x} cy={SPIRAL_EYE.y} r="0.55" />
      </g>
      <g className={styles.strand}>
        <path d={NOMAI_STRAND} vectorEffect="non-scaling-stroke" />
        <circle cx={SPIRAL_EYE.x} cy={SPIRAL_EYE.y} r="0.55" />
      </g>
    </svg>
  );
}

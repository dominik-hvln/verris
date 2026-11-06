export type StanAvatara = 'czeka' | 'szuka' | 'odpowiada';

/**
 * Avatar asystenta z sygnetu marki — ten sam co na verris.pl (makieta 1.11, 3 stany): czeka — spokojny; szuka — mięta
 * w trójkącie „oddycha”; odpowiada — pulsujący pierścień. Bez twarzy i ludzkiego imienia: od razu widać, że to nie
 * człowiek. Kolory sygnetu są stałe (znak marki wygląda tak samo w obu motywach); animacje: keyframes asy-* w globals.css.
 */
export function AsystentAvatar({ stan = 'czeka', rozmiar = 40 }: { stan?: StanAvatara; rozmiar?: number }) {
  return (
    <span className="relative inline-block flex-none rounded-[23%] leading-[0]" data-stan={stan} aria-hidden="true">
      <svg viewBox="0 0 80 80" width={rozmiar} height={rozmiar} focusable="false" className="block">
        <rect x="0.5" y="0.5" width="79" height="79" rx="18" fill="#0c1a14" stroke="rgba(52,229,160,.45)" />
        <g transform="translate(-2.5 -5.9) scale(0.85)">
          <path d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z" fill="#f4f4ee" fillRule="evenodd" />
          <path
            d="M44 55 L56 55 L50 69 Z"
            fill="#34e5a0"
            className={stan === 'szuka' ? 'animate-[asy-tri_1.1s_ease-in-out_infinite] motion-reduce:animate-none' : undefined}
          />
        </g>
      </svg>
      <i
        className={`pointer-events-none absolute -inset-[5px] rounded-[28%] border-2 border-transparent ${
          stan === 'odpowiada' ? 'animate-[asy-ring_1.8s_ease-out_infinite] motion-reduce:animate-none' : ''
        }`}
      />
    </span>
  );
}

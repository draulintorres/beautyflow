import { useThemeStore } from '../store/theme';
import styles from './ThemeToggleButton.module.css';

/**
 * Botón ícono sol/luna para cambiar entre tema claro y oscuro. Universal:
 * no depende de rol ni módulo — se usa tanto en el sistema interno
 * (Topbar, MobileMoreSheet) como en el portal de clientes (PortalShell).
 * Muestra el ícono del tema ACTIVO (sol = claro activo, luna = oscuro
 * activo); un click alterna.
 */
export function ThemeToggleButton({ className }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  // Si el caller manda su propio className (p. ej. para calzar en un header
  // ya estilizado del portal), se usa ESE en vez de sumarlo al estilo base
  // — evita choques de especificidad entre dos módulos CSS distintos.
  return (
    <button
      type="button"
      className={className ?? styles.btn}
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.5 14.3A8.5 8.5 0 019.7 3.5a8.5 8.5 0 1010.8 10.8z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
        </svg>
      )}
    </button>
  );
}

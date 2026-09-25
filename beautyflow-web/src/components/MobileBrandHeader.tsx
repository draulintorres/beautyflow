import estixaMark from '../assets/estixa-mark.png';
import styles from './MobileBrandHeader.module.css';

export function MobileBrandHeader() {
  return (
    <header className={styles.header}>
      <img src={estixaMark} alt="" className={styles.logoMark} />
      <span className={styles.logoWord}>Estixa</span>
    </header>
  );
}

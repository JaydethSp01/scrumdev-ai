type Props = {
  size?: number;
  className?: string;
};

export function Spinner({ size = 18, className = "" }: Props) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      style={{ width: size, height: size }}
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export default Spinner;

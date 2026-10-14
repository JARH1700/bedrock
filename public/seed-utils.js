export function seedValue(value) {
  const raw = String(value).trim();
  if (!/^-?\d{1,20}$/.test(raw)) throw new Error('Escribe una semilla numérica, incluidos negativos si corresponde.');
  const number = BigInt(raw);
  if (number < -(1n << 63n) || number > (1n << 63n) - 1n) throw new Error('La semilla debe ser un entero de 64 bits con signo.');
  return number.toString();
}
export function coordinate(value) {
  if (!/^-?\d+$/.test(String(value))) throw new Error('Introduce coordenadas enteras.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || Math.abs(number) > 30000000) throw new Error('Las coordenadas deben estar entre −30 000 000 y 30 000 000.');
  return number;
}

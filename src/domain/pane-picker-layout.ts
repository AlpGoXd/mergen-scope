export function pickerStep(width: number, height: number): { step: 'L' | 'M' | 'S' | 'I'; columns: 2 | 3 } {
  const columns = width < 300 && height > 300 ? 2 : 3;
  if (width >= 640 && height >= 400) return { step: 'L', columns };
  if (width >= 360 && height >= 300) return { step: 'M', columns };
  if (width >= 300 && height >= 150) return { step: 'S', columns };
  return { step: 'I', columns };
}
